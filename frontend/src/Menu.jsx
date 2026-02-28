import { useEffect, useState } from "react";

function Menu({ token, role, setToken }) {
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    fetch("http://localhost:5000/menu", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => setMenu(data));
  }, [token]);

  const logout = () => {
    localStorage.clear();
    setToken(null);
  };

  // =========================
  // ADMIN ADD ITEM
  // =========================
  const addMenuItem = async () => {
    const res = await fetch("http://localhost:5000/add-menu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name, price })
    });

    if (res.ok) {
      alert("Item added");
      setName("");
      setPrice("");
      const updated = await fetch("http://localhost:5000/menu", {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => res.json());
      setMenu(updated);
    }
  };

  // =========================
  // CART SYSTEM
  // =========================
  const addToCart = (item) => {
    const existing = cart.find(c => c.id === item.id);

    if (existing) {
      setCart(cart.map(c =>
        c.id === item.id ? { ...c, qty: c.qty + 1 } : c
      ));
    } else {
      setCart([...cart, { ...item, qty: 1 }]);
    }
  };

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  // =========================
  // RAZORPAY
  // =========================
  const payNow = async () => {
    const order = await fetch("http://localhost:5000/order/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ amount: total })
    }).then(res => res.json());

    const options = {
      key: "rzp_test_xxxxx",
      amount: order.amount,
      order_id: order.id,
      handler: async function (response) {
        await fetch("http://localhost:5000/order/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            ...response,
            total
          })
        });

        alert("Payment Successful");
        setCart([]);
      }
    };

    new window.Razorpay(options).open();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-10">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold">
          Smart Canteen
        </h1>
        <button
          onClick={logout}
          className="bg-black text-white px-6 py-2 rounded-xl"
        >
          Logout
        </button>
      </div>

      {/* ADMIN PANEL */}
      {role === "admin" && (
        <div className="bg-white p-6 rounded-2xl shadow mb-10">
          <h2 className="text-xl font-semibold mb-4">
            Add Menu Item
          </h2>

          <input
            className="border p-3 rounded-xl mr-4"
            placeholder="Item Name"
            value={name}
            onChange={e => setName(e.target.value)}
          />

          <input
            className="border p-3 rounded-xl mr-4"
            placeholder="Price"
            value={price}
            onChange={e => setPrice(e.target.value)}
          />

          <button
            onClick={addMenuItem}
            className="bg-black text-white px-6 py-3 rounded-xl"
          >
            Add
          </button>
        </div>
      )}

      {/* MENU GRID */}
      <div className="grid grid-cols-3 gap-8">
        {menu.map(item => (
          <div
            key={item.id}
            className="bg-white p-6 rounded-2xl shadow hover:shadow-lg transition"
          >
            <h3 className="text-xl font-semibold">
              {item.name}
            </h3>
            <p className="text-gray-500 mb-4">
              ₹{item.price}
            </p>

            {role === "student" && (
              <button
                onClick={() => addToCart(item)}
                className="bg-black text-white px-5 py-2 rounded-xl"
              >
                Add to Cart
              </button>
            )}
          </div>
        ))}
      </div>

      {/* CART SECTION */}
      {role === "student" && cart.length > 0 && (
        <div className="mt-14 bg-white p-8 rounded-2xl shadow-lg">
          <h2 className="text-2xl font-semibold mb-6">
            Cart
          </h2>

          {cart.map(item => (
            <div key={item.id} className="flex justify-between mb-3">
              <span>
                {item.name} x {item.qty}
              </span>
              <span>
                ₹{item.price * item.qty}
              </span>
            </div>
          ))}

          <div className="border-t pt-4 mt-4 flex justify-between text-xl font-bold">
            <span>Total</span>
            <span>₹{total}</span>
          </div>

          <button
            onClick={payNow}
            className="mt-6 w-full bg-black text-white py-4 rounded-xl"
          >
            Pay Now
          </button>
        </div>
      )}

    </div>
  );
}

export default Menu;