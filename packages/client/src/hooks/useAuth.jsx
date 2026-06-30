import { useContext } from "react";
import { UserContext } from "../contexts/User/UserContext.js";

export const useAuth = () => {
    const { user } = useContext(UserContext);
    return user && user.loggedIn;
};
