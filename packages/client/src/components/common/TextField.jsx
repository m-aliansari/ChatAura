import { Field, Input } from "@chakra-ui/react";
import { useField } from "formik";

export const TextField = ({ label, ...props }) => {
    const [field, meta] = useField(props);
    return (
        <Field.Root invalid={meta.touched && meta.error}>
            <Field.Label size={"lg"}>{label}</Field.Label>
            <Input {...field} {...props} />
            <Field.ErrorText>{meta.error}</Field.ErrorText>
        </Field.Root>
    );
};
