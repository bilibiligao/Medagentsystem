// Runtime Configuration — loaded before app.js
// apiBaseUrl defaults to window.location.origin in app.js when empty
// For single-port deployment (FastAPI serves frontend on same port), keep empty.
// For separate frontend/backend, set apiBaseUrl to the backend URL.
window.MEDGEMMA_CONFIG = {
    // apiBaseUrl: "http://192.168.1.100:8000"
};