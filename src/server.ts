// ------------------------------------------------
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import apiRouter from "./modules/router";
import { documentExpiryJob } from "./jobs/documentExpiryJob";
// ------------------------------------------------
dotenv.config();
const app = express();
// ------------------------------------------------

// Middleware
app.use(express.json());
app.use(cookieParser());

// Serve static files for local development (document uploads)
if (process.env.NODE_ENV !== 'production') {
  const uploadsPath = path.join(process.cwd(), 'public');
  app.use(express.static(uploadsPath));
  console.log(`📁 Serving static files from: ${uploadsPath}`);
}

// API routes
app.use("/api/v1", apiRouter);

// ------------------------------------------------
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Hello, App listening on the port ${PORT}`);
  
  // Start document expiry job
  documentExpiryJob.start();
  
  // Log job status
  const jobStatus = documentExpiryJob.getStatus();
  if (jobStatus.enabled) {
    console.log(`📅 Document expiry job started (next run: ${jobStatus.nextRun})`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  documentExpiryJob.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  documentExpiryJob.stop();
  process.exit(0);
});
// ------------------------------------------------
