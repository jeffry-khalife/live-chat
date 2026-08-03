import { useSocket as useSocketContext } from '../context/SocketContext.jsx';

function useSocket() {
    return useSocketContext();
}

export default useSocket;
