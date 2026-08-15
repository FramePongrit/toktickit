import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

describe("App", () => {
  // WORKED EXAMPLE — provided for you.
  it("renders the TokTickIT heading", () => {
    render(<App />);
    expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
  });

  // Issue 4 — write these yourself.
  it("shows Online and the seeded categories on success", async () => {
    vi.spyOn(api, "checkSystem").mockResolvedValue({
      online: true,
      categories: [
        { id: 1, name: "Account and Access" },
        { id: 2, name: "Hardware" }
      ]
    });

    render(<App />);
    const button = screen.getByRole("button", { name: /Check System/i });
    fireEvent.click(button);

    expect(await screen.findByText(/System Status: Online/i)).toBeInTheDocument();
    expect(screen.getByText(/1. Account and Access/i)).toBeInTheDocument();
    expect(screen.getByText(/2. Hardware/i)).toBeInTheDocument();
  });

  it("shows an Offline error message when the API is unavailable", async () => {
    vi.spyOn(api, "checkSystem").mockRejectedValue(new Error("API offline"));

    render(<App />);
    const button = screen.getByRole("button", { name: /Check System/i });
    fireEvent.click(button);

    expect(await screen.findByText(/System Status: Offline/i)).toBeInTheDocument();
    expect(screen.getByText(/Unable to connect to TokTickIT API/i)).toBeInTheDocument();
  });
});
