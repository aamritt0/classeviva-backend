import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  FRONTEND_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = [
      "http://localhost:5173",
      "http://localhost:4173",
      c.env.FRONTEND_URL,
    ].filter(Boolean) as string[];

    if (origin && allowedOrigins.includes(origin)) {
      return origin;
    }
    return "http://localhost:5173";
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Z-Auth-Token'],
}))

app.post("/api/classeviva/login", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { username, password, cid } = body;
    
    // Try Rest API first
    const restResponse = await fetch("https://web.spaggiari.eu/rest/v1/auth/login/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "CVVS/std/4.2.3",
        "Z-Dev-Apikey": "Tg1NWEwNGIgIC0K",
      },
      body: JSON.stringify({ uid: username, pass: password }),
    })

    if (restResponse.ok) {
      const data = await restResponse.json()
      return c.json({ ...data, loginType: 'rest' })
    }

    const restError = await restResponse.text()
    console.log("Rest login failed:", restError)

    // Try Web API (requires CID)
    if (cid) {
      const webResponse = await fetch("https://web.spaggiari.eu/auth-p7/app/default/AuthApi4.php?a=aLoginPwd", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        body: new URLSearchParams({
          cid: String(cid),
          uid: username,
          pwd: password,
        }).toString(),
      })

      if (webResponse.ok) {
        const data = await webResponse.json()
        return c.json({ ...data, loginType: 'web' })
      }
      
      const webError = await webResponse.text()
      console.error("Web login failed:", webError)
    }

    return c.json({
      error: "Authentication failed", 
      details: "Controlla le credenziali e il codice scuola.",
      raw: restError
    }, 401)

  } catch (error: any) {
    console.error("Login error:", error)
    return c.json({ error: "Internal server error", details: error.message }, 500)
  }
})

// Generic proxy for Classeviva Rest API
app.all("/api/classeviva/proxy/:studentId/*", async (c) => {
  const studentId = c.req.param("studentId")
  const token = c.req.header("Z-Auth-Token")
  
  if (!token) {
    return c.json({ error: "Missing auth token" }, 401)
  }

  try {
    const urlObj = new URL(c.req.url)
    const pathnameOriginal = urlObj.pathname
    // extract what's after studentId/
    const prefix = `/api/classeviva/proxy/${studentId}/`
    const apiPath = pathnameOriginal.startsWith(prefix) ? pathnameOriginal.slice(prefix.length) : ""
    
    const url = `https://web.spaggiari.eu/rest/v1/students/${studentId}/${apiPath}${urlObj.search}`
    const method = c.req.method
    
    const headers = new Headers({
        "Z-Auth-Token": token,
        "Z-Dev-Apikey": "Tg1NWEwNGIgIC0K",
        "User-Agent": "CVVS/std/4.2.3",
        "Content-Type": "application/json",
    })
    
    let reqBody: string | undefined = undefined;
    if (method !== "GET" && method !== "HEAD") {
      reqBody = await c.req.text().catch(() => undefined)
    }
    
    const response = await fetch(url, {
      method,
      headers,
      body: reqBody
    })

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
        return c.json(typeof data === "object" ? data : { error: "upstream error", raw: data }, response.status as any)
    }
    
    if (typeof data === "string") {
        return c.text(data)
    }
    return c.json(data)

  } catch (error: any) {
    console.error(`Proxy error:`, error)
    return c.json({ error: "Internal server error", details: error.message }, 500)
  }
})

app.get("/api/classeviva/grades/:studentId", async (c) => {
  const studentId = c.req.param("studentId")
  const token = c.req.header("Z-Auth-Token")

  if (!token) {
    return c.json({ error: "Missing auth token" }, 401)
  }

  try {
    const response = await fetch(`https://web.spaggiari.eu/rest/v1/students/${studentId}/grades`, {
      method: "GET",
      headers: {
        "Z-Auth-Token": token,
        "Z-Dev-Apikey": "Tg1NWEwNGIgIC0K",
        "User-Agent": "CVVS/std/4.2.3",
      },
    })

    const text = await response.text()
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }
    
    if (!response.ok) {
        return c.json(typeof data === "object" ? data : { error: "upstream error" }, response.status as any)
    }
    
    if (typeof data === "string") {
        return c.text(data)
    }
    return c.json(data)

  } catch (error: any) {
    console.error("Grades fetch error:", error)
    return c.json({ error: "Internal server error", details: error.message }, 500)
  }
})

app.get("/health", (c) => {
  return c.json({ status: "ok" })
})

export default app
