import assert from "node:assert/strict";
import test from "node:test";

test("carga el flujo de solicitudes con todas sus dependencias válidas", async () => {
  const module = await import("../src/request-access.mjs");
  assert.ok(module);
});

test("solo clasifica como recuperable el código exacto de solapamiento aprobado", async () => {
  const { classifySubmissionResponse } = await import("../src/request-access.mjs");
  assert.deepEqual(classifySubmissionResponse(201, {}), { submitted: true });
  assert.deepEqual(classifySubmissionResponse(400, {
    ErrorDetails: {
      ErrorCode: { Key: "PSPortal.Requests.Policies.RemoteAppAccesssAlreadyAvailable" },
    },
    Message: "This account is already available during the requested time for Application access.",
  }), {
    submitted: false,
    conflict: {
      type: "approved_access_overlap",
      code: "PSPortal.Requests.Policies.RemoteAppAccesssAlreadyAvailable",
      message: "This account is already available during the requested time for Application access.",
    },
  });
  assert.throws(
    () => classifySubmissionResponse(400, {
      ErrorDetails: { ErrorCode: { Key: "Otro.Error" } },
      Message: "Otro problema",
    }),
    /Otro\.Error.*Otro problema/,
  );
});
