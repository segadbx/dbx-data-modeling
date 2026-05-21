import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leadingIcon, ...rest },
  ref,
) {
  if (leadingIcon) {
    return (
      <div className="input-with-icon">
        <span className="input-with-icon-glyph" aria-hidden>
          {leadingIcon}
        </span>
        <input ref={ref} className={["input", className ?? ""].join(" ")} {...rest} />
      </div>
    );
  }
  return <input ref={ref} className={["input", className ?? ""].join(" ")} {...rest} />;
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={["textarea", className ?? ""].join(" ")} {...rest} />;
});
