import zipfile
import os
import sys

zip_path = r"E:\MedGemma\backups\myapp_pre_refactor_20260130.zip"
workspace_root = r"E:\MedGemma"

if not os.path.exists(zip_path):
    print(f"Error: Backup file not found at {zip_path}")
    sys.exit(1)

print(f"Restoring from {zip_path}...")

try:
    with zipfile.ZipFile(zip_path, 'r') as zf:
        file_list = zf.namelist()
        if not file_list:
            print("Error: Zip file is empty")
            sys.exit(1)
        
        first_file = file_list[0]
        # Normalize path separators
        first_file = first_file.replace('\\', '/')
        
        # Determine extraction target
        if first_file.startswith("myapp/"):
            target_dir = workspace_root
            print(f"Detected 'myapp' root folder in zip. Extracting to {target_dir}")
        else:
            target_dir = os.path.join(workspace_root, "myapp")
            print(f"Detected content-only zip. Extracting to {target_dir}")
            
        zf.extractall(target_dir)
        print("Restoration successful.")

except Exception as e:
    print(f"Error during extraction: {e}")
    sys.exit(1)
