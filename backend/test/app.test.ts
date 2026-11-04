import request from "supertest";
import { app } from "../src/app";

describe("health endpoint", () => {
  it("returns an API health status", async () => {
    await request(app).get("/health").expect(200).expect({ status: "ok" });
  });

  it("returns the standard error format for unknown routes", async () => {
    await request(app)
      .get("/missing")
      .expect(404)
      .expect({
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
        },
      });
  });
});
