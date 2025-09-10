package websocket

import (
	"log"
	"net"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

// Hub manages all WebSocket clients and broadcasts messages to them.
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	Commands   chan []byte
	mu         sync.RWMutex
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		Commands:   make(chan []byte),
		clients:    make(map[*Client]bool),
	}
}

// Run starts the hub's event loop.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Println("WebSocket client registered")

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Println("WebSocket client unregistered")

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					// If the client's send buffer is full, unregister and close.
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()

		case command := <-h.Commands:
			// Commands are handled by external processors (like FrontendCommunicator)
			log.Printf("Received command: %s", string(command))
		}
	}
}

// Broadcast sends a message to all connected clients.
func (h *Hub) Broadcast(message []byte) {
	h.broadcast <- message
}

// SendCommand sends a command to be processed by external handlers.
func (h *Hub) SendCommand(command []byte) {
	h.Commands <- command
}

// upgrader holds the WebSocket upgrader configuration.
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow localhost and 10.10.10.0/24 network
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // Allow requests without Origin header
		}
		
		// Allow localhost (development)
		if origin == "http://localhost:5173" || origin == "https://localhost:5173" {
			return true
		}
		
		// Allow 10.10.10.0/24 network
		if host, _, err := net.SplitHostPort(r.Host); err == nil {
			if strings.HasPrefix(host, "10.10.10.") {
				return true
			}
		}
		
		return false
	},
}

// ServeWs handles WebSocket requests from the peer.
func (h *Hub) ServeWs(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	client := &Client{hub: h, conn: conn, send: make(chan []byte, 256)}
	h.register <- client

	// Allow collection of memory referenced by the caller by doing all work in new goroutines.
	go client.writePump()
	go client.readPump()
}
