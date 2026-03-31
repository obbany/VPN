import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for sending confirmation email
  app.post("/api/send-confirmation-email", async (req, res) => {
    const { email, orderId, items, total, credentials } = req.body;

    console.log(`Attempting to send confirmation email for Order #${orderId} to ${email}`);

    if (!email || !orderId || !items || !total) {
      console.error("Missing required fields for email:", { email, orderId, items: !!items, total });
      return res.status(400).json({ error: "Missing required fields for email confirmation." });
    }

    if (!resend) {
      console.error("RESEND_API_KEY is not set. Cannot send email.");
      return res.status(500).json({ error: "Email service is not configured (RESEND_API_KEY missing)." });
    }

    try {
      // Build HTML for items and their credentials with a more professional look
      const itemsHtml = items.map((item: any) => {
        const itemCreds = credentials?.[item.id] || [];
        const credsHtml = Array.isArray(itemCreds) 
          ? itemCreds.map((c: any, idx: number) => `
              <div style="background-color: #1a1a1a; padding: 15px; border-radius: 10px; margin-top: 10px; border: 1px solid #333; border-left: 4px solid #2563eb;">
                <p style="margin: 0 0 8px; font-size: 12px; color: #3b82f6; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Account ${idx + 1}</p>
                <table style="width: 100%; border-collapse: collapse;">
                  ${c.email ? `<tr><td style="padding: 4px 0; font-size: 14px; color: #888; width: 80px;">Email:</td><td style="padding: 4px 0; font-size: 14px; color: #fff; font-family: monospace;">${c.email}</td></tr>` : ""}
                  ${c.pass ? `<tr><td style="padding: 4px 0; font-size: 14px; color: #888;">Password:</td><td style="padding: 4px 0; font-size: 14px; color: #fff; font-family: monospace;">${c.pass}</td></tr>` : ""}
                  ${c.key ? `<tr><td style="padding: 4px 0; font-size: 14px; color: #888;">Key:</td><td style="padding: 4px 0; font-size: 14px; color: #fff; font-family: monospace; color: #3b82f6;">${c.key}</td></tr>` : ""}
                </table>
              </div>
            `).join("")
          : "";

        return `
          <div style="margin-bottom: 30px; background-color: #161616; padding: 20px; border-radius: 12px; border: 1px solid #222;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <h4 style="margin: 0; color: #ffffff; font-size: 18px;">${item.name}</h4>
              <span style="color: #3b82f6; font-weight: bold; background: rgba(59, 130, 246, 0.1); padding: 4px 12px; border-radius: 20px; font-size: 12px;">${item.quantity} x ৳${item.price}</span>
            </div>
            <div style="margin-top: 10px;">
              ${credsHtml || '<p style="color: #666; font-size: 13px; font-style: italic;">Access details will be sent shortly.</p>'}
            </div>
          </div>
        `;
      }).join("");
      
      // IMPORTANT: If you are using a free Resend account without a verified domain, 
      // you can only send emails to the email address you signed up with.
      // To send to any email, you MUST verify your domain in the Resend dashboard.
      const { data, error } = await resend.emails.send({
        from: "Nexus VPN <onboarding@resend.dev>", 
        to: [email],
        subject: `Order Confirmed - #${orderId}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Order Confirmation</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #050505; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #050505; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #0f0f0f; border-radius: 20px; overflow: hidden; border: 1px solid #1a1a1a; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                    <!-- Header -->
                    <tr>
                      <td align="center" style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 50px 40px;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 800; text-transform: uppercase; letter-spacing: 4px; text-shadow: 0 2px 10px rgba(0,0,0,0.2);">Nexus VPN</h1>
                        <p style="margin: 15px 0 0; color: rgba(255,255,255,0.8); font-size: 16px; font-weight: 500;">Order Confirmation & Access Details</p>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <p style="margin: 0 0 20px; color: #ffffff; font-size: 18px; font-weight: 600;">Hello,</p>
                        <p style="margin: 0 0 30px; color: #a0a0a0; font-size: 15px; line-height: 1.6;">Your order has been successfully processed. We've assigned your VPN access credentials below. Please keep this email safe for future reference.</p>
                        
                        <div style="background-color: #1a1a1a; padding: 12px 20px; border-radius: 10px; display: inline-block; border: 1px solid #2563eb; margin-bottom: 40px;">
                          <span style="color: #888; font-size: 13px; margin-right: 10px;">Order ID:</span>
                          <span style="color: #3b82f6; font-weight: 700; font-family: monospace; font-size: 15px;">#${orderId}</span>
                        </div>

                        <div style="margin-bottom: 40px;">
                          <h3 style="margin: 0 0 20px; color: #ffffff; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; border-bottom: 1px solid #222; padding-bottom: 10px;">Your VPN Access</h3>
                          ${itemsHtml}
                        </div>

                        <!-- Summary -->
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 2px solid #1a1a1a; padding-top: 25px; margin-top: 20px;">
                          <tr>
                            <td style="color: #888; font-size: 16px;">Total Amount Paid</td>
                            <td align="right" style="color: #3b82f6; font-size: 24px; font-weight: 800;">৳${total}</td>
                          </tr>
                        </table>

                        <!-- Support Box -->
                        <div style="margin-top: 50px; padding: 25px; background-color: #161616; border-radius: 15px; border: 1px dashed #333; text-align: center;">
                          <h4 style="margin: 0 0 10px; color: #ffffff; font-size: 16px;">Need Assistance?</h4>
                          <p style="margin: 0; color: #888; font-size: 14px; line-height: 1.5;">Our support team is available 24/7 to help you with the setup. Simply reply to this email or visit our support center.</p>
                        </div>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td align="center" style="padding: 30px; background-color: #0a0a0a; border-top: 1px solid #1a1a1a;">
                        <p style="margin: 0; color: #444; font-size: 12px; font-weight: 500;">&copy; 2026 Nexus VPN Services. All Rights Reserved.</p>
                        <p style="margin: 8px 0 0; color: #333; font-size: 11px;">This is an automated transactional email. Please do not reply.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      });

      if (error) {
        console.error("Resend API Error:", error);
        return res.status(500).json({ error: error.message });
      }

      console.log(`Email sent successfully to ${email}. Data:`, data);
      res.status(200).json({ message: "Email sent successfully", data });
    } catch (err: any) {
      console.error("Critical Email Sending Error:", err);
      res.status(500).json({ error: err.message || "An unexpected error occurred while sending the email." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
