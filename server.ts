import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS headers per il frontend (porta 5173 in dev)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:4173",
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Z-Auth-Token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Proxy for Classeviva API to avoid CORS
app.post("/api/classeviva/login", async (req, res) => {
  const { username, password, cid } = req.body;
  try {
    // Try Rest API first (standard for mobile apps)
    const restResponse = await fetch("https://web.spaggiari.eu/rest/v1/auth/login/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "CVVS/std/4.2.3",
        "Z-Dev-Apikey": "Tg1NWEwNGIgIC0K",
      },
      body: JSON.stringify({
        uid: username,
        pass: password,
      }),
    });

    if (restResponse.ok) {
      const data = await restResponse.json();
      return res.json({
        ...data,
        loginType: 'rest'
      });
    }

    const restError = await restResponse.text();
    console.log("Rest login failed:", restError);

    // If Rest fails, try Web API (requires CID usually)
    if (cid) {
      const webResponse = await fetch("https://web.spaggiari.eu/auth-p7/app/default/AuthApi4.php?a=aLoginPwd", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        body: new URLSearchParams({
          cid: cid,
          uid: username,
          pwd: password,
        }).toString(),
      });

      if (webResponse.ok) {
        const data = await webResponse.json();
        return res.json({
          ...data,
          loginType: 'web'
        });
      }
      
      const webError = await webResponse.text();
      console.error("Web login failed:", webError);
    }

    res.status(401).json({ 
      error: "Authentication failed", 
      details: "Controlla le credenziali e il codice scuola.",
      raw: restError
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// Generic proxy for Classeviva Rest API
app.all("/api/classeviva/proxy/:studentId/*", async (req, res) => {
  const { studentId } = req.params;
  const token = req.headers["z-auth-token"];
  const apiPath = req.params[0]; // The rest of the path after studentId/

  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  try {
    const url = `https://web.spaggiari.eu/rest/v1/students/${studentId}/${apiPath}`;
    const response = await fetch(url, {
      method: req.method,
      headers: {
        "Z-Auth-Token": token as string,
        "Z-Dev-Apikey": "Tg1NWEwNGIgIC0K",
        "User-Agent": "CVVS/std/4.2.3",
        "Content-Type": "application/json",
      },
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error(`Proxy error for ${apiPath}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/classeviva/grades/:studentId", async (req, res) => {
  const { studentId } = req.params;
  const token = req.headers["z-auth-token"];

  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  try {
    const response = await fetch(`https://web.spaggiari.eu/rest/v1/students/${studentId}/grades`, {
      method: "GET",
      headers: {
        "Z-Auth-Token": token as string,
        "Z-Dev-Apikey": "Tg1NWEwNGIgIC0K",
        "User-Agent": "CVVS/std/4.2.3",
      },
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error("Grades fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
