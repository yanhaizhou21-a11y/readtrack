import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReminderSettingsScreen } from "./ReminderSettingsScreen";
import * as reminderApi from "./reminderApi";
import * as documentsApi from "@/features/library/api/documents";
import type { Reminder, DocumentSummary } from "@/types";

vi.mock("./reminderApi");
vi.mock("@/features/library/api/documents");

const mockHabitReminder: Reminder = {
  id: "habit-1",
  documentId: null,
  enabled: true,
  scheduleType: "daily",
  timeOfDayMin: 1200, // 20:00
  daysOfWeek: null,
  scheduledAt: null,
  repeatInterval: null,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const mockBookReminder: Reminder = {
  id: "rem-book-1",
  documentId: "doc-1",
  enabled: true,
  scheduleType: "weekdays",
  timeOfDayMin: 540, // 09:00
  daysOfWeek: null,
  scheduledAt: null,
  repeatInterval: null,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const mockDoc: DocumentSummary = {
  id: "doc-1",
  title: "The Odyssey",
  fileType: "epub",
  fileSize: 10240,
  sectionCount: 24,
  progress: 0.15,
  completed: false,
  isArchived: false,
  createdAt: 1700000000000,
  parseStatus: "ready",
};

describe("ReminderSettingsScreen component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reminderApi.checkNotificationPermission).mockResolvedValue(true);
    vi.mocked(reminderApi.requestNotificationPermission).mockResolvedValue(true);
    vi.mocked(documentsApi.listDocuments).mockResolvedValue({
      items: [mockDoc],
      total: 1,
    });
  });

  it("renders loading skeleton and then loads reminder data", async () => {
    vi.mocked(reminderApi.reminderList).mockResolvedValueOnce([mockHabitReminder]);

    render(
      <MemoryRouter>
        <ReminderSettingsScreen />
      </MemoryRouter>
    );

    // After loading resolves
    await waitFor(() => {
      expect(screen.getByText("Reading Reminders")).toBeInTheDocument();
      expect(screen.getByText("Offline and Private")).toBeInTheDocument();
      expect(screen.getByText("Habit Reminder")).toBeInTheDocument();
    });
  });

  it("renders error state when reminder loading fails and allows retry", async () => {
    vi.mocked(reminderApi.reminderList)
      .mockRejectedValueOnce(new Error("Database offline"))
      .mockResolvedValueOnce([mockHabitReminder]);

    render(
      <MemoryRouter>
        <ReminderSettingsScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Unable to load reminders")).toBeInTheDocument();
      expect(screen.getByText("Database offline")).toBeInTheDocument();
    });

    // Tap retry
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Habit Reminder")).toBeInTheDocument();
    });
  });

  it("toggles habit reminder and calls reminderUpsert", async () => {
    vi.mocked(reminderApi.reminderList).mockResolvedValueOnce([mockHabitReminder]);
    vi.mocked(reminderApi.reminderUpsert).mockResolvedValueOnce({
      ...mockHabitReminder,
      enabled: false,
    });

    render(
      <MemoryRouter>
        <ReminderSettingsScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Habit Reminder")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole("switch", { name: "Toggle habit reminder" });
    expect(toggleBtn).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(reminderApi.reminderUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "habit-1",
          documentId: null,
          enabled: false,
        })
      );
    });
  });

  it("changes schedule frequency to custom and displays days of week pills", async () => {
    vi.mocked(reminderApi.reminderList).mockResolvedValueOnce([mockHabitReminder]);
    vi.mocked(reminderApi.reminderUpsert).mockResolvedValue({
      ...mockHabitReminder,
      scheduleType: "custom",
      daysOfWeek: 31,
    });

    render(
      <MemoryRouter>
        <ReminderSettingsScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "custom" })).toBeInTheDocument();
    });

    // Select custom frequency
    fireEvent.click(screen.getByRole("button", { name: "custom" }));

    await waitFor(() => {
      expect(screen.getByText("Active Days")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Monday" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sunday" })).toBeInTheDocument();
    });

    // Toggle a day (e.g. Sunday)
    fireEvent.click(screen.getByRole("button", { name: "Sunday" }));

    await waitFor(() => {
      expect(reminderApi.reminderUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleType: "custom",
        })
      );
    });
  });

  it("triggers test notification when button is clicked", async () => {
    vi.mocked(reminderApi.reminderList).mockResolvedValueOnce([mockHabitReminder]);
    vi.mocked(reminderApi.reminderTestNotify).mockResolvedValueOnce({
      title: "Continue reading: The Odyssey",
      body: "Book 1 · 15% completed. Tap to resume.",
      documentId: "doc-1",
      position: null,
    });

    render(
      <MemoryRouter>
        <ReminderSettingsScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Send Test Notification")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Send Test Notification"));

    await waitFor(() => {
      expect(reminderApi.reminderTestNotify).toHaveBeenCalledWith("habit-1");
      expect(
        screen.getByText("Test notification sent. Check your notification center.")
      ).toBeInTheDocument();
    });
  });

  it("renders book-specific reminders and handles toggling and deletion", async () => {
    vi.mocked(reminderApi.reminderList).mockResolvedValueOnce([
      mockHabitReminder,
      mockBookReminder,
    ]);
    vi.mocked(reminderApi.reminderDelete).mockResolvedValueOnce(undefined);

    render(
      <MemoryRouter>
        <ReminderSettingsScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("The Odyssey")).toBeInTheDocument();
      expect(screen.getByText("09:00")).toBeInTheDocument();
    });

    // Delete book reminder
    const deleteBtn = screen.getByRole("button", {
      name: "Delete reminder for The Odyssey",
    });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(reminderApi.reminderDelete).toHaveBeenCalledWith("rem-book-1");
    });
  });

  it("renders empty state when no book-specific reminders exist", async () => {
    vi.mocked(reminderApi.reminderList).mockResolvedValueOnce([mockHabitReminder]);

    render(
      <MemoryRouter>
        <ReminderSettingsScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText("No book specific reminders configured")
      ).toBeInTheDocument();
    });
  });
});
