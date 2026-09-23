import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../../src/components/AppShell.js";
import { renderAuthenticated } from "../support/auth.js";

beforeEach(() => {
  window.localStorage.clear();
});

describe("Authenticated Requester application shell", () => {
  it("shows the authenticated User and Requester navigation", async () => {
    renderAuthenticated(
      <MemoryRouter initialEntries={["/tickets"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/tickets" element={<p>Ticket list</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId("current-user")).toHaveTextContent("Jennifer Anderson");
    expect(screen.getByTestId("current-role")).toHaveTextContent("Requester");
    expect(screen.getByRole("link", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Ticket" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change Requester/i })).not.toBeInTheDocument();
  });

  it("does not persist or restore a development requester selector identity", async () => {
    renderAuthenticated(
      <MemoryRouter initialEntries={["/tickets"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/tickets" element={<p>Ticket list</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    await screen.findByTestId("current-user");
    expect(window.localStorage.getItem("toktickit.requesterId")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Select Development Requester/i })).not.toBeInTheDocument();
  });
});
