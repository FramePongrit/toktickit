import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
// Must follow Bootstrap: the theme overrides component-level variables that
// Bootstrap sets, so load order decides which wins.
import "./theme.css";
import { AppRouter } from "./AppRouter.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
