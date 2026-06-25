
export const socketCompatibleMiddleware =
    expressMiddleware => (socket, next) => expressMiddleware(socket.request, {}, next);
