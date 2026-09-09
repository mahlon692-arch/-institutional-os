const { io } = require("socket.io-client");

// Use 127.0.0.1 instead of localhost to bypass WSL IPv6 routing issues
const socket = io("http://127.0.0.1:5000", {
  auth: {
    token: "MOCK_JWT_TOKEN_FOR_TESTING"
  }
});

socket.on("connect", () => {
  console.log("[Test Gate] Connected to engine. Transmitting gate scan...");

  socket.emit("gate_scan_event", {
    tenantId: "school_01",
    studentId: "STU-2026-042",
    status: "IN",
    gateName: "Main Gate Alpha"
  });

  setTimeout(() => {
    console.log("[Test Gate] Transmitting Truancy Alert scan...");
    socket.emit("gate_scan_event", {
      tenantId: "school_01",
      studentId: "STU-2026-108",
      status: "TRUANCY_ALERT",
      gateName: "North Perimeter Gate"
    });
  }, 2000);

  setTimeout(() => {
    console.log("[Test Gate] Simulation complete.");
    process.exit(0);
  }, 3000);
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err.message);
});
