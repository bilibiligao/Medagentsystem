import http.server
import socketserver
import webbrowser
from threading import Timer
import os

PORT = 3000
DIRECTORY = "frontend"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def open_browser():
    webbrowser.open(f"http://localhost:{PORT}")

if __name__ == "__main__":
    # Ensure we are in the right directory
    if not os.path.exists(DIRECTORY):
        print(f"Error: Directory '{DIRECTORY}' not found.")
        print("Please run this script from the 'myapp' folder.")
        exit(1)

    print(f"Serving HTTP on 0.0.0.0 port {PORT} (http://localhost:{PORT}) ...")
    
    # Schedule browser open
    Timer(1.5, open_browser).start()

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
