import { useContext, useEffect, useState } from "react";
import { getSocketCon } from "../../utils/socket.js";
import { SocketContext } from "./SocketContext.js";
import { UserContext } from "../User/UserContext.js";

export const SocketContextProvide = ({ children }) => {
  const { user } = useContext(UserContext);
  const [socket, setSocket] = useState(() => getSocketCon(user));

  useEffect(() => {
    setSocket(() => getSocketCon(user));
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
