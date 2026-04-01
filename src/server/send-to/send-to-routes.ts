import { Router } from "express";
import { access, constants } from "node:fs/promises";
import { resolve } from "node:path";
import type { DestinationRegistry } from "./destination-registry.js";

export function createSendToRouter(registry: DestinationRegistry): Router {
  const router = Router();

  // List available destinations
  router.get("/destinations", (_req, res) => {
    res.json(registry.getAll());
  });

  // Send a file to a destination
  router.post("/", async (req, res) => {
    const { filePath, destination, params } = req.body ?? {};

    if (!filePath) {
      res.status(400).json({ success: false, message: "filePath is required" });
      return;
    }
    if (!destination) {
      res.status(400).json({ success: false, message: "destination is required" });
      return;
    }

    // Validate file exists
    try {
      await access(resolve(filePath), constants.R_OK);
    } catch {
      res.status(404).json({ success: false, message: `File not found: ${filePath}` });
      return;
    }

    // Look up provider
    const provider = registry.get(destination);
    if (!provider) {
      res.status(400).json({
        success: false,
        message: `Unknown destination: "${destination}". Available: ${registry.getAvailableIds().join(", ")}`,
      });
      return;
    }

    // Validate params
    const paramError = provider.validateParams(params ?? {});
    if (paramError) {
      res.status(400).json({ success: false, message: paramError });
      return;
    }

    // Execute send
    try {
      const result = await provider.send(resolve(filePath), params ?? {});
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: `Internal error: ${err.message}` });
    }
  });

  return router;
}
