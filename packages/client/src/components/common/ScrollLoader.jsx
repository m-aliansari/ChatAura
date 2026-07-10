import { HStack, Spinner, Text } from "@chakra-ui/react";

/**
 * Inline "fetching the next page" indicator for the two infinite-scroll lists.
 *
 * `role="status"` + `aria-live="polite"` announces the load to screen readers without stealing
 * focus, and the visible label doubles as the spinner's accessible name — so no `aria-label` is
 * needed on the Spinner itself.
 */
export const ScrollLoader = ({ label }) => (
    <HStack
        role="status"
        aria-live="polite"
        w="100%"
        justify="center"
        gap="0.5rem"
        py={{ base: "0.5rem", md: "0.75rem" }}
        flexShrink="0"
    >
        <Spinner size="sm" borderWidth="2px" color="teal.500" />
        <Text fontSize="sm" color="fg.muted">
            {label}
        </Text>
    </HStack>
);
