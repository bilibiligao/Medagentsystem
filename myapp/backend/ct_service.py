import pydicom
import numpy as np
import io
import base64
from PIL import Image
import logging

try:
    from pydicom.pixels import apply_modality_lut
except ImportError:
    try:
        from pydicom.pixel_data_handlers.util import apply_modality_lut
    except ImportError:
        try:
            from pydicom.pixel_data_handlers.util import apply_rescale as apply_modality_lut
        except ImportError:
            apply_modality_lut = None

LOGGER = logging.getLogger("MedGemma")

# --- Server-Side Context Cache ---
# For a single-user local deployment, a simple global variable suffices.
# In a multi-user environment, this would be a keyed dictionary or Redis.
GLOBAL_CT_CACHE = {
    "images": [], # List of base64 strings or PIL objects
    "prompt_structure": [] # Pre-calculated prompt parts
}

def set_global_context(processed_result):
    """Store the processed CT sequence in global cache for chat retrieval."""
    GLOBAL_CT_CACHE["images"] = processed_result
    LOGGER.info(f"CT Context cached on server. Count: {len(processed_result)}")

def get_global_context():
    """Retrieve cached images for prompt injection."""
    return GLOBAL_CT_CACHE["images"]

def norm(ct_vol: np.ndarray, min_val: float, max_val: float) -> np.ndarray:
    """Window and normalize CT imaging Hounsfield values to values 0 - 255."""
    ct_vol = np.clip(ct_vol, min_val, max_val)
    ct_vol = ct_vol.astype(np.float32)
    ct_vol -= min_val
    ct_vol /= (max_val - min_val) 
    ct_vol *= 255.0
    return ct_vol

def apply_windowing(ct_slice_pixel_array: np.ndarray) -> np.ndarray:
    """
    Apply MedGemma specific 3-channel windowing.
    Red: Wide window (-1024, 1024)
    Green: Soft tissue window (-135, 215)
    Blue: Brain window (0, 80)
    """
    # 3 channels mapping
    # Red: Wide window
    red = norm(ct_slice_pixel_array, -1024, 1024)
    # Green: Soft tissue
    green = norm(ct_slice_pixel_array, -135, 215)
    # Blue: Brain
    blue = norm(ct_slice_pixel_array, 0, 80)
    
    # Stack to create RGB image (H, W, 3)
    rgb_slice = np.stack([red, green, blue], axis=-1)
    return np.round(rgb_slice, 0).astype(np.uint8)

def encode_image(image_array: np.ndarray, format="JPEG") -> str:
    """Encode numpy array image to base64 string with resize."""
    with io.BytesIO() as img_bytes:
        # Convert numpy array to PIL Image
        img = Image.fromarray(image_array)
        # Resize to max 512x512 to save bandwidth and VRAM (MedGemma inputs are typically processed)
        img.thumbnail((512, 512))
        img.save(img_bytes, format=format, quality=85)
        img_bytes.seek(0)
        encoded_string = base64.b64encode(img_bytes.getbuffer()).decode("utf-8")
    return f"data:image/{format.lower()};base64,{encoded_string}"

def encode_pil_image(img: Image.Image, format="JPEG") -> str:
    """Encode PIL Image to base64 string with resize."""
    with io.BytesIO() as img_bytes:
        if img.mode != "RGB":
             img = img.convert("RGB")
        # Resize
        img.thumbnail((512, 512))
        img.save(img_bytes, format=format, quality=85)
        img_bytes.seek(0)
        encoded_string = base64.b64encode(img_bytes.getbuffer()).decode("utf-8")
    return f"data:image/{format.lower()};base64,{encoded_string}"

def process_mixed_files(files_data):
    """
    Process a list of file data which can be pydicom Datasets or PIL Images.
    files_data: List of objects, each object has:
      - type: 'dicom' or 'image'
      - data: pydicom dataset or PIL Image
      - name: filename (for sorting images)
    """
    try:
        # Separate
        dicom_items = [x for x in files_data if x['type'] == 'dicom']
        image_items = [x for x in files_data if x['type'] == 'image']
        
        # Priority: If DICOMs exist, process them preferably (as they contain HU data)
        # If both exist, we could return error or just process DICOMs. 
        # For flexibility, if DICOMs > 0, we process DICOMs.
        # If no DICOMs, we process Images.
        
        processed_images = []
        
        if len(dicom_items) > 0:
            # Process DICOMs
            # 1. Sort
            def get_dicom_sort_key(item):
                ds = item['data']
                if hasattr(ds, 'InstanceNumber') and ds.InstanceNumber:
                    return int(ds.InstanceNumber)
                if hasattr(ds, 'SliceLocation'):
                    return float(ds.SliceLocation)
                return 0
            
            sorted_items = sorted(dicom_items, key=get_dicom_sort_key)
            
            # 2. Sample
            max_slices = 85
            if len(sorted_items) > max_slices:
                indices = [int(round(i / max_slices * (len(sorted_items) - 1))) for i in range(1, max_slices + 1)]
                sampled_items = [sorted_items[i] for i in indices]
            else:
                sampled_items = sorted_items
                
            # 3. Window & Encode
            for idx, item in enumerate(sampled_items):
                try:
                    ds = item['data']
                    pixel_array = ds.pixel_array
                    
                    # Convert to Hounsfield Units (HU)
                    # Try using apply_modality_lut or manual calculation
                    if apply_modality_lut:
                        try:
                            hu_array = apply_modality_lut(pixel_array, ds)
                        except Exception:
                            # Fallback if function fails on specific data
                            slope = float(getattr(ds, 'RescaleSlope', 1))
                            intercept = float(getattr(ds, 'RescaleIntercept', 0))
                            hu_array = (pixel_array * slope) + intercept
                    else:
                        # Manual Rescale Slope/Intercept
                        slope = float(getattr(ds, 'RescaleSlope', 1))
                        intercept = float(getattr(ds, 'RescaleIntercept', 0))
                        hu_array = (pixel_array * slope) + intercept

                    rgb_array = apply_windowing(hu_array)
                    b64_img = encode_image(rgb_array)
                    
                    processed_images.append({
                        "index": idx + 1,
                        "original_index": get_dicom_sort_key(item),
                        "image": b64_img
                    })
                except Exception as e:
                    LOGGER.error(f"Error processing DICOM slice {idx}: {e}")
                    continue
                    
        elif len(image_items) > 0:
            # Process Images (PNG/JPG)
            # 1. Natural Sort Helper
            import re
            def natural_keys(text):
                return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', text)]
                
            sorted_items = sorted(image_items, key=lambda x: natural_keys(x['name']))
            
            # 2. Sample
            max_slices = 85
            if len(sorted_items) > max_slices:
                indices = [int(round(i / max_slices * (len(sorted_items) - 1))) for i in range(1, max_slices + 1)]
                sampled_items = [sorted_items[i] for i in indices]
            else:
                sampled_items = sorted_items
                
            # 3. Encode (No Windowing possible)
            for idx, item in enumerate(sampled_items):
                try:
                    img = item['data']
                    b64_img = encode_pil_image(img)
                    
                    processed_images.append({
                        "index": idx + 1,
                        "original_index": item['name'],
                        "image": b64_img
                    })
                except Exception as e:
                     LOGGER.error(f"Error processing Image slice {idx}: {e}")
                     continue
        
        return processed_images

    except Exception as e:
        LOGGER.error(f"Error in process_mixed_files: {str(e)}")
        raise e

def process_dicom_files(valid_dicom_datasets):
    # Backward compatibility wrapper or deprecated
    # wrapping into new structure
    data = [{'type': 'dicom', 'data': ds, 'name': ''} for ds in valid_dicom_datasets]
    return process_mixed_files(data)

