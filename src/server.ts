// ------------------------------------------------
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import apiRouter from "./modules/router";
// ------------------------------------------------
dotenv.config();
const app = express();
// ------------------------------------------------
app.use(express.json());
app.use(cookieParser());
app.use("/api", apiRouter);
// ------------------------------------------------
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Hello, App listening on the port ${PORT}`);
});
// ------------------------------------------------
