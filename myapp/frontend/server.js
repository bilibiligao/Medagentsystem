const express = require('express');
const path = require('path');
const { Readable } = require('stream'); // For converting Web Stream to Node Stream

const app = express();

// Configuration
// Backend URL (The real destination)
const BACKEND_URL = process.env.API_URL || "http://localhost:8000";
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies (needed for logging)
app.use(express.json({ limit: '50mb' }));

// Serve config.js dynamically
// Point Frontend to THIS Node Server (Relative path) instead of direct backend
app.get('/env-config.js', (req, res) => {
    res.type('application/javascript');
    // Using empty string implies relative path to current origin
    res.send(`window.MEDGEMMA_CONFIG = { apiBaseUrl: "" };`);
});

// Logging Proxy Middleware for /api routes
// Intercepts requests, logs them, and forwards to Python Backend
app.use('/api', async (req, res) => {
    // Construct target URL (e.g. /api/chat -> http://localhost:8000/api/chat)
    // Note: app.use('/api') strips '/api' from req.url, so we need to add it back
    // req.url here will be "/chat" or "/detect"
    const targetUrl = `${BACKEND_URL}/api${req.url}`;
    
    console.log(`\n[${new Date().toISOString()}] Proxying ${req.method} -> ${targetUrl}`);

    // LOGGING LOGIC
    if (req.method === 'POST' && req.body) {
        try {
            // Create a copy for logging to avoid printing huge base64 strings
            const logBody = JSON.parse(JSON.stringify(req.body));
            
            if (logBody.messages && Array.isArray(logBody.messages)) {
                logBody.messages = logBody.messages.map(msg => {
                    // Summarize content if it's a list (which might contain images)
                    if (Array.isArray(msg.content)) {
                        return {
                            ...msg,
                            content: msg.content.map(item => {
                                if (item.type === 'image') {
                                    return `[Image: ${item.image.substring(0, 30)}... (${item.image.length} chars)]`;
                                }
                                return item;
                            })
                        };
                    }
                    return msg;
                });
            }
            
            console.log("--------------------------------------------------------------------------------");
            console.log("REQUEST BODY:");
            console.log(JSON.stringify(logBody, null, 2));
            console.log("--------------------------------------------------------------------------------");
        } catch (e) {
            console.log("[Log Error] Could not serialize body for logging");
        }
    }

    // FORWARDING LOGIC
    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                // Copy auth headers if needed, but skip host
            },
        };

        // Attach body if not GET
        if (req.method !== 'GET' && req.method !== 'HEAD') {
             fetchOptions.body = JSON.stringify(req.body);
        }

        // Perform Request
        const response = await fetch(targetUrl, fetchOptions);

        // Forward Status & Headers
        res.status(response.status);
        response.headers.forEach((val, key) => {
             res.setHeader(key, val);
        });

        // Pipe Response (Streaming support)
        if (response.body) {
             // For streaming, we need to handle the data events to log throughput or finish
             // But piping directly is most efficient. 
             // To debug "no output", we can hook into the stream slightly?
             // No, let's trust the pipe. If backend sends data, pipe forwards it.
             
             // Convert Web Stream (fetch) to Node Stream
             const nodeStream = Readable.fromWeb(response.body);
             
             nodeStream.on('error', (err) => {
                 console.error("Stream Error:", err);
             });
             
             nodeStream.pipe(res);
        } else {
             res.end();
        }

    } catch (error) {
        console.error("Proxy Error:", error);
        res.status(500).json({ error: "Proxy Error", details: error.message });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// Fallback for SPA

// Fallback for SPA (Single Page Application)
// 所有其他请求返回 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`MedGemma Frontend Server Running`);
    console.log(`----------------------------------------`);
    console.log(`Local Interface: http://localhost:${PORT}`);
    console.log(`Backend Target : ${BACKEND_URL}`);
    console.log(`========================================`);
});
