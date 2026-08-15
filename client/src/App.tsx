import { useState } from "react";
import { checkSystem, Category } from "./api.js";

// UI states you must handle for Issue 4: idle, loading, success, error.
type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  void categories;

  async function handleCheck() {
    setState("loading");
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch (err) {
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      <div className="mt-4 p-3 border border-dark">
        {state === "idle" && (
          <p className="text-muted">[ Check System ]</p>
        )}
        {state === "loading" && (
          <p className="text-muted">Loading...</p>
        )}
        {state === "success" && (
          <div>
            <p>System Status: Online</p>
            <div className="mt-3">
              <p className="mb-2">Supported Request Categories:</p>
              <ul className="list-unstyled ps-3 mb-0">
                {categories.map((c, i) => (
                  <li key={c.id}>{i + 1}. {c.name}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {state === "error" && (
          <div>
            <p>System Status: Offline</p>
            <p className="text-danger">Unable to connect to TokTickIT API</p>
          </div>
        )}
      </div>
    </div>
  );
}
