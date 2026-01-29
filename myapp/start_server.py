import uvicorn
import os
import sys
import webbrowser
from threading import Timer

def open_browser():
    webbrowser.open("http://localhost:8000")

if __name__ == "__main__":
    # Ensure backend directory is in path so we can import app
    backend_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
    sys.path.append(backend_path)
    
    # Check if we are in the correct directory
    if not os.path.exists(os.path.join(backend_path, "app.py")):
        print("Error: Could not find backend/app.py. Please run this script from the 'myapp' folder.")
        sys.exit(1)

    print("Starting MedGemma Local Server...")
    print("Web Interface will open at http://localhost:8000")
    
    # Schedule browser open
    Timer(1.5, open_browser).start()
    
    # Run Uvicorn
    # We use string import to enable reload if needed, but here we run programmatically
    # Pointing to app:app inside backend module
    try:
        from backend import app as backend_app
        uvicorn.run(backend_app.app, host="0.0.0.0", port=8000)
    except ImportError as e:
        print(f"Error importing app: {e}")
        print("Make sure you installed dependencies: pip install -r backend/requirements.txt")
