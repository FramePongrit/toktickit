import { loadServerEnvironment } from "./security/environment.js";
import { createApp } from "./app.js";
import { loadSecurityConfig } from "./security/config.js";

loadServerEnvironment();

const PORT = Number(process.env.PORT) || 3000;
const serverApp = createApp(loadSecurityConfig());

serverApp.listen(PORT, () => {
  console.log(`TokTickIT API listening on http://localhost:${PORT}`);
});
