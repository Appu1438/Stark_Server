import express from "express";
import { v4 as uuid } from "uuid";
import { isAuthenticatedDriver } from "../middleware/isAuthenticated";
import { generateAccessToken } from "../utils/generateToken";

const sessionRouter = express.Router();
let sessionStore = {}; // Ideally use Redis for production

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes in ms

sessionRouter.post("/", isAuthenticatedDriver, (req, res) => {
  const token = generateAccessToken(req.body.driverId)
  const sessionId = uuid();
  // console.log(sessionId)
  sessionStore[sessionId] = {
    token: token,
    driverId: req.body.driverId,
    name: req.body.name,
    email: req.body.email,
    phone_number: req.body.phone_number,
    createdAt: Date.now(),
  };
  console.log('Session Created', sessionStore[sessionId], sessionId)

  res.json({ sessionId });
});

sessionRouter.get("/:id", (req, res) => {
  console.log(req.params.id)
  const session = sessionStore[req.params.id];
  if (!session) {
    console.log('Session Expired', sessionStore[req.params.id])
    return res.status(404).json({ message: "Session expired" })
  };

  const now = Date.now();
  if (now - session.createdAt > SESSION_TIMEOUT) {
    // Auto-expire
    console.log('Session Expiring Now', sessionStore[req.params.id])
    delete sessionStore[req.params.id];
    return res.status(410).json({ message: "Session expired" }); // 410 Gone is more appropriate
  }

  res.json(session);
});

// ✅ Clear Session manually
sessionRouter.delete("/:id", isAuthenticatedDriver, (req, res) => {
  if (sessionStore[req.params.id]) {
    console.log('Session Deleted', sessionStore[req.params.id])

    delete sessionStore[req.params.id];
    return res.json({ message: "Session cleared" });
  }
  res.status(404).json({ message: "Session not found" });
});

// 🧹 Periodic cleanup (optional for memory safety)
setInterval(() => {
  const now = Date.now();
  Object.keys(sessionStore).forEach((key) => {
    if (now - sessionStore[key].createdAt > SESSION_TIMEOUT) {
      console.log('Session Deleting Automatically', sessionStore[key])
      delete sessionStore[key];
    }
  });
}, 60 * 1000); // runs every 1 min

export default sessionRouter;
