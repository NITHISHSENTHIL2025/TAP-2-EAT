import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Login({ setToken, setRole }) {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = async (type) => {
    const endpoint =
      type === "admin"
        ? "http://localhost:5000/admin/login"
        : "http://localhost:5000/login";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", type === "admin" ? "admin" : "student");

      setToken(data.token);
      setRole(type === "admin" ? "admin" : "student");

      navigate("/menu");
    } else {
      alert(data.message || "Login failed");
    }
  };

  const register = async () => {
    const res = await fetch("http://localhost:5000/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      alert("Account created. Now login.");
    } else {
      alert(data.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">

      <div className="bg-white p-10 rounded-3xl shadow-xl w-96">

        <h1 className="text-3xl font-bold mb-6 text-center">
          Smart Canteen
        </h1>

        <input
          className="w-full border p-3 rounded-xl mb-4"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full border p-3 rounded-xl mb-6"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <button
          onClick={() => login("student")}
          className="w-full bg-black text-white py-3 rounded-xl mb-3"
        >
          Login as Student
        </button>

        <button
          onClick={() => login("admin")}
          className="w-full border border-black py-3 rounded-xl mb-6"
        >
          Login as Admin
        </button>

        <p className="text-center text-sm mb-2">
          Don’t have an account?
        </p>

        <button
          onClick={register}
          className="w-full bg-gray-200 py-2 rounded-xl"
        >
          Create Account
        </button>

      </div>
    </div>
  );
}

export default Login;