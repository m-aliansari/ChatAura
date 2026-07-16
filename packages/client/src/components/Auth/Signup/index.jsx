import { VStack, ButtonGroup, Field, Button, Input, Heading, Text } from "@chakra-ui/react";
import { useFormik } from "formik";
import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../../../constants/api";
import { ROUTE_NAMES } from "../../../constants/routes";
import { API_ROUTES, registerFormSchema } from "@realtime-chatapp/common";
import { UserContext } from "../../../contexts/User/UserContext.js";
import { GENERIC_ERROR } from "@realtime-chatapp/common";
import { LOCAL_STORAGE_TOKEN_KEY } from "../../../constants/auth.js";

export const Signup = () => {
    const { setUser } = useContext(UserContext);
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const formik = useFormik({
        initialValues: {
            fullName: "",
            username: "",
            password: "",
            confirmPassword: "",
        },
        validationSchema: registerFormSchema,
        onSubmit: (values, actions) => {
            const vals = { ...values };
            actions.resetForm();
            fetch(`${API_BASE_URL}${API_ROUTES.AUTH.REGISTER}`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(vals),
            })
                .then((res) => {
                    if (!res || !res.ok || res.status >= 400) return setError(GENERIC_ERROR);
                    return res.json();
                })
                .then((data) => {
                    if (!data) return setError(GENERIC_ERROR);
                    if (data.status) return setError(data.status);
                    localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, data.token);
                    setUser({ ...data });
                    navigate(ROUTE_NAMES.HOME);
                })
                .catch(() => {
                    return setError(GENERIC_ERROR);
                });
        },
    });
    return (
        <VStack
            as="form"
            w={{ base: "90%", md: "500px" }}
            m="auto"
            justify={"center"}
            h="100vh"
            onSubmit={formik.handleSubmit}
        >
            <Heading>Sign Up</Heading>
            <Text as="p" color="red.500">
                {error}
            </Text>
            <Field.Root invalid={formik.errors.fullName && formik.touched.fullName}>
                <Field.Label size={"lg"}>Full Name</Field.Label>
                <Input
                    name="fullName"
                    placeholder="Enter your full name"
                    autoComplete="off"
                    size={"lg"}
                    {...formik.getFieldProps("fullName")}
                />
                <Field.ErrorText>{formik.errors.fullName}</Field.ErrorText>
            </Field.Root>
            <Field.Root invalid={formik.errors.username && formik.touched.username}>
                <Field.Label size={"lg"}>Username</Field.Label>
                <Input
                    name="username"
                    placeholder="Enter username"
                    autoComplete="off"
                    size={"lg"}
                    {...formik.getFieldProps("username")}
                />
                <Field.ErrorText>{formik.errors.username}</Field.ErrorText>
            </Field.Root>
            <Field.Root invalid={formik.errors.password && formik.touched.password}>
                <Field.Label size={"lg"}>Password</Field.Label>
                <Input
                    name="password"
                    type="password"
                    placeholder="Enter password"
                    autoComplete="off"
                    size={"lg"}
                    {...formik.getFieldProps("password")}
                />
                <Field.ErrorText>{formik.errors.password}</Field.ErrorText>
            </Field.Root>
            <Field.Root invalid={formik.errors.confirmPassword && formik.touched.confirmPassword}>
                <Field.Label size={"lg"}>Confirm Password</Field.Label>
                <Input
                    name="confirmPassword"
                    type="password"
                    placeholder="Re-enter password"
                    autoComplete="off"
                    size={"lg"}
                    {...formik.getFieldProps("confirmPassword")}
                />
                <Field.ErrorText>{formik.errors.confirmPassword}</Field.ErrorText>
            </Field.Root>
            <ButtonGroup>
                <Button colorPalette={"teal"} type="submit">
                    Create Account
                </Button>
                <Link to="/">
                    <Button>Log In</Button>
                </Link>
            </ButtonGroup>
        </VStack>
    );
};
