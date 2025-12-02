import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  const version = process.env.npm_package_version || "dev";
  res.status(200).type("html").send(`
    <!doctype html>
    <html lang="en">
    <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>DITrix Attendance Scanner — API</title>
    <style>
        :root{--bg:#0f1724;--card:#0b1220;--accent:#4f46e5;--muted:#9aa4b2;--glass:rgba(255,255,255,0.03)}
        html,body{height:100%;margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial}
        body{display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#071028 0%, #071b2a 100%);color:#e6eef8}
        .card{width:min(760px,92vw);background:linear-gradient(180deg,var(--card),#07101a);padding:28px;border-radius:12px;box-shadow:0 8px 30px rgba(2,6,23,0.6);border:1px solid rgba(255,255,255,0.03)}
        .header{display:flex;align-items:center;gap:16px}
        .logo{width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--accent),#06b6d4);display:flex;align-items:center;justify-content:center;font-weight:700;color:white}
        h1{margin:0;font-size:20px}
        p.lead{margin:10px 0 18px;color:var(--muted)}
        .note{background:var(--glass);padding:12px;border-radius:8px;color:var(--muted);font-size:14px}
        .links{margin-top:18px;display:flex;gap:12px;flex-wrap:wrap}
        a.btn{display:inline-block;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.04);color:#eaf0ff;text-decoration:none;border:1px solid rgba(255,255,255,0.03)}
        a.primary{background:linear-gradient(90deg,var(--accent),#06b6d4);border:none;box-shadow:0 6px 18px rgba(79,70,229,0.18)}
        footer{margin-top:18px;color:var(--muted);font-size:13px}
        @media (max-width:420px){.header{gap:10px}.logo{width:48px;height:48px}}
    </style>
    </head>
    <body>
    <div class="card" role="main" aria-labelledby="title">
        <div class="header">
        <div class="logo">DA</div>
        <div>
            <h1 id="title">DITrix Attendance Scanner — API</h1>
            <div class="lead">This endpoint is the API server. It is not intended for direct use via a browser.</div>
        </div>
        </div>

        <div class="note">
          Use the mobile app or a client that talks to the API. To register or sign-in, POST to <code>/auth/signup</code> and <code>/auth/login</code>.
          If you're testing from an Android emulator use <code>http://10.0.2.2:${
            process.env.PORT || 5600
          }</code>.
        </div>

        <div class="note">
          You can download the latest apk from my github from the link below.
        </div>

        <div class="links">
          <a class="btn" href="/auth" title="Auth routes">Auth routes</a>
          <a class="btn" href="/profile" title="Profile routes">Profile</a>
          <a class="btn primary" href="${"https://github.com/jhonkeithman123/DITrix_Attendance_Scanner/blob/main/README.md"}" title="Contact">Need help? Check README</a>
          <a class="btn primary" href="${"https://github.com/jhonkeithman123/DITrix_Attendance_Scanner/releases"}">Download the latest APK from GITHUB</a>
        </div>

        <footer>Server version: ${version} — Listening on ${
    req.headers.host
  }</footer>
    </div>
    </body>
    </html>`);
});

export default router;
