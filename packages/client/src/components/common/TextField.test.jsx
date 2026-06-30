import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Formik, Form } from "formik";
import { renderWithProviders } from "../../test/renderWithProviders.jsx";
import { TextField } from "./TextField.jsx";

function renderField({ initialErrors, initialTouched } = {}) {
    return renderWithProviders(
        <Formik
            initialValues={{ username: "" }}
            initialErrors={initialErrors}
            initialTouched={initialTouched}
            onSubmit={() => {}}
        >
            <Form>
                <TextField name="username" label="Username" placeholder="Enter username" />
            </Form>
        </Formik>,
    );
}

describe("TextField", () => {
    it("renders its label and input", () => {
        renderField();
        expect(screen.getByText("Username")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Enter username")).toBeInTheDocument();
    });

    it("updates its value as the user types", async () => {
        renderField();
        const input = screen.getByPlaceholderText("Enter username");
        await userEvent.type(input, "alice");
        expect(input).toHaveValue("alice");
    });

    it("shows the validation error when the field is touched and invalid", () => {
        renderField({
            initialErrors: { username: "Username required" },
            initialTouched: { username: true },
        });
        expect(screen.getByText("Username required")).toBeInTheDocument();
    });

    it("does not show an error when the field is valid", () => {
        renderField();
        expect(screen.queryByText("Username required")).not.toBeInTheDocument();
    });
});
