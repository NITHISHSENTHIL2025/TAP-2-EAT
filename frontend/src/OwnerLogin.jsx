import { useState } from "react";

function OwnerLogin({ setToken, setRole }) {
  const [mkey, setMkey] = useState("");

  const handleLogin = async () => {
    const res = await fetch("http://localhost:5000/owner-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mkey })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", "admin");
      setRole("admin");
      setToken(data.token);
    } else {
      alert(data.message);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "100px" }}>
      <h2>Owner Login</h2>
      <input
        placeholder="Enter MKEY"
        value={mkey}
        onChange={(e) => setMkey(e.target.value)}
      />
      <br /><br />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}

export default OwnerLogin;