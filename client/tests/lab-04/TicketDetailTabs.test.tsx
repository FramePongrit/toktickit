import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { TicketDetailTabs } from "../../src/components/TicketDetailTabs.js";

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

describe("Ticket detail tabs", () => {
  it("supports roving focus with arrows, Home, and End while preserving deep-link query values", async () => {
    render(<MemoryRouter initialEntries={["/tickets/42?tab=actions&actionId=55"]}>
      <Routes><Route path="/tickets/:id" element={<><TicketDetailTabs details={<p>Ticket fields</p>} actions={<p>Action history</p>} /><CurrentLocation /></>} /></Routes>
    </MemoryRouter>);

    const actions = screen.getByRole("tab", { name: "Actions Taken" });
    expect(actions).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Actions Taken" })).toBeVisible();
    actions.focus();
    fireEvent.keyDown(actions, { key: "ArrowLeft" });
    const details = screen.getByRole("tab", { name: "Ticket Details" });
    expect(details).toHaveFocus();
    expect(details).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("location")).toHaveTextContent("actionId=55");
    fireEvent.keyDown(details, { key: "End" });
    expect(actions).toHaveFocus();
    expect(actions).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(actions, { key: "Home" });
    expect(details).toHaveFocus();
  });
});
