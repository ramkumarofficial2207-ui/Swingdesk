import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "swingdesk-app";
export default defineRailway(() => {
  const swingdeskApp = service("swingdesk-app", {
    source: github("ramkumarofficial2207-ui/Swingdesk", { branch: "main", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE" },
    start: "sh -c 'if command -v uvicorn >/dev/null 2>&1 && [ -f /app/service.py ]; then exec uvicorn service:app --host 0.0.0.0 --port ${PORT:-8000}; else exec npm start; fi'",
    healthcheck: "/api/ready",
    healthcheckTimeout: 100,
    preDeploy: "sh -c 'if command -v npx >/dev/null 2>&1; then exec npx prisma db push --skip-generate; fi'",
    replicas: { "europe-west4-drams3a": 1 },
  });

  return project("swingdesk", {
    variables: { managed: false },
    resources: [swingdeskApp],
  });
});
