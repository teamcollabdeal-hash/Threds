import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { parseSignedRequest } from "../src/lib/threads/signed-request";

const secret = "s3cret";
const make = (obj: object, key = secret) => {
  const payload = Buffer.from(JSON.stringify(obj)).toString("base64url");
  const sig = createHmac("sha256", key).update(payload).digest("base64url");
  return `${sig}.${payload}`;
};

describe("parseSignedRequest", () => {
  it("приймає коректний підпис", () => {
    expect(parseSignedRequest(make({ user_id: "123", algorithm: "HMAC-SHA256" }), secret)?.user_id).toBe("123");
  });
  it("відхиляє підроблений підпис", () => {
    expect(parseSignedRequest(make({ user_id: "123" }, "other"), secret)).toBeNull();
    expect(parseSignedRequest("garbage", secret)).toBeNull();
    expect(parseSignedRequest(null, secret)).toBeNull();
  });
});
