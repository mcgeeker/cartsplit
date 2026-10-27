import type { Meta, StoryObj } from "@storybook/react-vite";
import { OnboardingView } from "./OnboardingView";

const meta = {
  title: "Onboarding/OnboardingView",
  component: OnboardingView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ width: 384 }}>
        <Story />
      </div>
    ),
  ],
  args: { onConnect: () => {} },
} satisfies Meta<typeof OnboardingView>;

export default meta;
type Story = StoryObj<typeof OnboardingView>;

export const Connect: Story = { args: { phase: "connect" } };
export const Connecting: Story = { args: { phase: "connecting" } };
export const Saving: Story = { args: { phase: "saving" } };
export const ErrorState: Story = {
  args: { phase: "error", error: "YNAB could not validate your token. Try again." },
};

export const ChooseBudget: Story = {
  args: { phase: "picking", hasToken: true, plans: [{ id: "test-budget", name: "Extension Test Budget" }], selectedId: "" },
};
