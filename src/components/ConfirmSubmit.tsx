"use client";

// A submit button that asks for confirmation before submitting its form.
// Used to gate irreversible actions (deleting a child's data). Works inside a
// server-action <form> — if the user cancels, the submit is prevented.

export function ConfirmSubmit({
  message,
  className = "btn",
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
