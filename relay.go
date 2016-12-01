package main

import (
	"fmt"
	"net"
	"net/http"

	"golang.org/x/net/websocket"
)

const serverAddress = "sandbox.techcompliant.com:2000"

func relayServer(ws *websocket.Conn) {
	conn, err := net.Dial("tcp", serverAddress)
	if err != nil {
		fmt.Printf("failed to open TCP connection to server: %v\n", err)
		return
	}

	// WS -> TCP
	go func(ws *websocket.Conn, tcp net.Conn) {
		defer ws.Close()
		defer tcp.Close()

		var buf []byte
		for {
			err := websocket.Message.Receive(ws, &buf)
			if err != nil {
				return
			}
			tcp.Write(buf)
		}
	}(ws, conn)

	func(dst *websocket.Conn, src net.Conn) {
		defer dst.Close()
		defer src.Close()
		buf := make([]byte, 65536)
		for {
			n, err := src.Read(buf)
			if err != nil {
				fmt.Printf("Error while reading from tcp: %v\n", err)
				return
			}
			err = websocket.Message.Send(dst, buf[0:n])
			if err != nil {
				fmt.Printf("Error while writing to ws: %v\n", err)
				return
			}
		}
	}(ws, conn)
}

// Relays things in both directions between incoming websocket connections and
// each one's separate TCP connection to the GEMU server.
func main() {
	http.Handle("/gemu", websocket.Handler(relayServer))
	http.Handle("/", http.FileServer(http.Dir("app")))
	err := http.ListenAndServe(":8467", nil) // TC in ASCII
	if err != nil {
		panic("ListenAndServe: " + err.Error())
	}
}
