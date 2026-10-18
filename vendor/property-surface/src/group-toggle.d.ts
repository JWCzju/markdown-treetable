export interface GroupToggleOptions {
  name: string;
  icon?: string;
  className?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
}
export function createGroupToggle(parent: HTMLElement, options: GroupToggleOptions): {
  button: HTMLButtonElement;
  setOpen(open: boolean): void;
};
