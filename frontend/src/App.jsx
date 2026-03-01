import React, { useState, useEffect, useMemo } from "react";

// ==========================================
// UTILITIES
// ==========================================

const loadCashfreeScript = () => {
  return new Promise((resolve) => {
    if (window.Cashfree) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const parseOrderItems = (rawItemsData) => {
  if (!rawItemsData) return [];
  if (Array.isArray(rawItemsData)) return rawItemsData;
  try { return JSON.parse(rawItemsData); } catch (error) { return []; }
};

// ==========================================
// MAIN APPLICATION COMPONENT
// ==========================================

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  
  const [currentView, setCurrentView] = useState("home"); 
  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem("theme") === "dark");
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [notificationsData, setNotificationsData] = useState([]);
  const [isNotificationsMenuOpen, setIsNotificationsMenuOpen] = useState(false);

  const [isLoadingMenu, setIsLoadingMenu] = useState(false);
  const [isOrderPlacing, setIsOrderPlacing] = useState(false);
  const [isAdminUpdating, setIsAdminUpdating] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  const [masterMenuItems, setMasterMenuItems] = useState([]);
  const [activeCartItems, setActiveCartItems] = useState([]);
  const [databaseLiveOrders, setDatabaseLiveOrders] = useState([]);
  const [favoriteItemIds, setFavoriteItemIds] = useState(JSON.parse(localStorage.getItem("favs")) || []);
  
  const [stockInputs, setStockInputs] = useState({}); 
  const [nowServingToken, setNowServingToken] = useState("--");
  const [revenueData, setRevenueData] = useState(null);

  const [searchInputQuery, setSearchInputQuery] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("All");
  const [selectedPickupTime, setSelectedPickupTime] = useState("ASAP");
  const [liveClockTime, setLiveClockTime] = useState(Date.now());

  // POINTING TO LOCAL SERVER
  const BACKEND_API_URL = "https://tap-2-eat.onrender.com";

  const displayToast = (messageText) => {
    setToastMessage(messageText);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const htmlElement = document.documentElement;
    if (isDarkMode) {
      htmlElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      htmlElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // RESTORE PENDING CART ON LOAD
  useEffect(() => {
    const pendingOrderRaw = localStorage.getItem("tap2eat_pending_order");
    if (pendingOrderRaw && !window.location.search.includes('order_id')) {
      try {
        const pendingOrder = JSON.parse(pendingOrderRaw);
        if (pendingOrder.items && pendingOrder.items.length > 0 && activeCartItems.length === 0) {
          setActiveCartItems(pendingOrder.items);
          displayToast("Restored your previous pending cart.");
        }
      } catch (e) { }
    }
  }, []);

  // CASHFREE VERIFICATION HANDLER
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const returnedOrderId = urlParams.get('order_id');

    if (returnedOrderId && token) {
      const verifyPayment = async () => {
        try {
          const pendingOrderRaw = localStorage.getItem("tap2eat_pending_order");
          const pendingOrder = pendingOrderRaw ? JSON.parse(pendingOrderRaw) : { items: [], pickupTime: "ASAP", prepTimeTotal: 15 };

          const response = await fetch(`${BACKEND_API_URL}/verify-cashfree-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({
              order_id: returnedOrderId,
              items: pendingOrder.items,
              pickupTime: pendingOrder.pickupTime,
              prepTimeTotal: pendingOrder.prepTimeTotal
            })
          });

          if (response.ok) {
            setShowSuccessOverlay(true);
            setActiveCartItems([]);
            localStorage.removeItem("tap2eat_pending_order");
            setTimeout(() => {
              setShowSuccessOverlay(false);
              setCurrentView("history");
            }, 3500);
          } else {
            alert("Payment verification failed. Your cart has been restored.");
            setIsCartDrawerOpen(true);
          }
        } catch (error) {
          console.error("Verification Error:", error);
        } finally {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };
      verifyPayment();
    }
  }, [token, BACKEND_API_URL]);

  useEffect(() => {
    // ANTI-CRASH MENU FETCH
    const fetchMenuCatalog = async () => {
      setIsLoadingMenu(true);
      try {
        const response = await fetch(`${BACKEND_API_URL}/menu`);
        if (response.ok) {
          const data = await response.json();
          // Force it to be an array so .forEach never crashes
          setMasterMenuItems(Array.isArray(data) ? data : []);
        } else {
          setMasterMenuItems([]);
        }
      } catch (error) {
        setMasterMenuItems([]);
      } finally {
        setIsLoadingMenu(false);
      }
    };
    fetchMenuCatalog();

    const liveClockInterval = setInterval(() => setLiveClockTime(Date.now()), 30000);
    let liveOrdersInterval;
    
    // ANTI-CRASH LIVE FEED FETCH
    const fetchLiveFeed = async () => {
      if (document.hidden) return; 

      try {
        const publicRes = await fetch(`${BACKEND_API_URL}/public/now-serving`);
        if(publicRes.ok) {
           const pubData = await publicRes.json();
           setNowServingToken(pubData.nowServing);
        }

        if(!token) return;

        if (role === "admin" && currentView === "admin-revenue") {
            const revRes = await fetch(`${BACKEND_API_URL}/admin/revenue`, { headers: { "Authorization": `Bearer ${token}` }});
            if(revRes.ok) setRevenueData(await revRes.json());
        }

        let targetEndpoint = role === "admin" ? "/admin/orders" : "/my-orders";
        const response = await fetch(`${BACKEND_API_URL}${targetEndpoint}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.ok) {
          const latestOrdersArray = await response.json();
          if (Array.isArray(latestOrdersArray)) {
            if (role === "student" && databaseLiveOrders.length > 0) {
              const newlyReadyOrder = latestOrdersArray.find((newOrder) => {
                const oldOrderRef = databaseLiveOrders.find(oldOrder => oldOrder.id === newOrder.id);
                return oldOrderRef && oldOrderRef.status !== 'Ready' && newOrder.status === 'Ready';
              });
              if (newlyReadyOrder) {
                setNotificationsData(prevArray => [`🎉 Fantastic! Your order #${newlyReadyOrder.token_number} is READY for pickup!`, ...prevArray]);
                displayToast(`Token #${newlyReadyOrder.token_number} is Ready!`);
              }
            }
            setDatabaseLiveOrders(latestOrdersArray);
          } else {
            setDatabaseLiveOrders([]);
          }
        }
      } catch (error) {
        console.error("Feed error hidden to prevent crash");
      }
    };

    fetchLiveFeed(); 
    liveOrdersInterval = setInterval(fetchLiveFeed, 15000); 
    document.addEventListener("visibilitychange", fetchLiveFeed);

    return () => {
      clearInterval(liveOrdersInterval);
      clearInterval(liveClockInterval);
      document.removeEventListener("visibilitychange", fetchLiveFeed);
    };
  }, [token, role, currentView, databaseLiveOrders.length, BACKEND_API_URL]);

  const handleAddToCart = (dataItem) => {
    setActiveCartItems(prevItems => {
      const existingItem = prevItems.find(item => item.id === dataItem.id);
      if (existingItem) {
        if (existingItem.quantity >= dataItem.stock) {
            displayToast(`Only ${dataItem.stock} available in stock.`);
            return prevItems;
        }
        return prevItems.map(item => item.id === dataItem.id ? { ...item, quantity: (item.quantity || 1) + 1 } : item);
      }
      return [...prevItems, { ...dataItem, quantity: 1 }];
    });
    displayToast(`Added to cart`);
  };

  const updateCartQuantity = (itemId, delta) => {
    setActiveCartItems(prevItems => prevItems.map(item => {
      if (item.id === itemId) return { ...item, quantity: (item.quantity || 1) + delta };
      return item;
    }).filter(item => item.quantity > 0)); 
  };

  const handleReorder = (orderItemsJson) => {
    const parsedItems = parseOrderItems(orderItemsJson);
    setActiveCartItems(prevCart => {
      let newCart = [...prevCart];
      parsedItems.forEach(reorderItem => {
        const existingIndex = newCart.findIndex(item => item.id === reorderItem.id);
        const qtyToAdd = reorderItem.quantity || 1;
        if (existingIndex >= 0) {
          newCart[existingIndex] = { ...newCart[existingIndex], quantity: (newCart[existingIndex].quantity || 1) + qtyToAdd };
        } else {
          newCart.push({ ...reorderItem, quantity: qtyToAdd });
        }
      });
      return newCart;
    });
    displayToast("Items added to cart.");
    setIsCartDrawerOpen(true);
  };

  const toggleItemFavoriteStatus = (itemId) => {
    let updatedFavoritesList = favoriteItemIds.includes(itemId) 
      ? favoriteItemIds.filter(f => f !== itemId) 
      : [...favoriteItemIds, itemId];
    setFavoriteItemIds(updatedFavoritesList);
    localStorage.setItem("favs", JSON.stringify(updatedFavoritesList));
  };

  const calculateSmartWaitTime = (orderObject) => {
    const orderCreationTime = new Date(orderObject.created_at).getTime();
    const earlierQueuePrepTime = databaseLiveOrders
      .filter(o => o.status === 'Preparing' && new Date(o.created_at).getTime() < orderCreationTime)
      .reduce((total, o) => total + (Number(o.prep_time_total) || 0), 0);
    const specificPrepTime = Number(orderObject.prep_time_total) || 0;
    const predictedReadyTimestamp = orderCreationTime + ((earlierQueuePrepTime + specificPrepTime) * 60000);
    return Math.max(0, Math.ceil((predictedReadyTimestamp - liveClockTime) / 60000));
  };

  const getKitchenQueueColor = (orderObj) => {
     if (orderObj.status === 'Ready') return 'border-t-green-500 bg-green-50 dark:bg-green-900/10';
     const creationTime = new Date(orderObj.created_at).getTime();
     const elapsedMinutes = (liveClockTime - creationTime) / 60000;
     const expectedTime = Number(orderObj.prep_time_total) || 15;
     
     if (elapsedMinutes > expectedTime + 5) return 'border-t-red-500 bg-red-50 dark:bg-red-900/10 shadow-[0_0_15px_rgba(239,68,68,0.2)]'; 
     if (elapsedMinutes > expectedTime * 0.5) return 'border-t-orange-400 bg-orange-50 dark:bg-orange-900/10'; 
     return 'border-t-black dark:border-t-white'; 
  };

  const extractedCategoriesList = ["All"];
// SAFETY CHECK: Only run the loop if it is actually an array
if (Array.isArray(masterMenuItems)) {
  masterMenuItems.forEach((item) => {
    const itemCategory = item.category || "General";
    if (!extractedCategoriesList.includes(itemCategory)) extractedCategoriesList.push(itemCategory);
  });
}

  const dynamicallyFilteredMenu = useMemo(() => {
    let resultingMenuArray = [...masterMenuItems];
    if (currentView === "favourites") resultingMenuArray = resultingMenuArray.filter(item => favoriteItemIds.includes(item.id));
    if (searchInputQuery !== "") resultingMenuArray = resultingMenuArray.filter(item => item.name.toLowerCase().includes(searchInputQuery.toLowerCase()));
    if (activeCategoryFilter !== "All") resultingMenuArray = resultingMenuArray.filter(item => (item.category || "General") === activeCategoryFilter);
    return resultingMenuArray;
  }, [masterMenuItems, searchInputQuery, activeCategoryFilter, currentView, favoriteItemIds]);

  const executeLogoutFlow = () => {
    setToken(""); setRole(""); setActiveCartItems([]); setIsCartDrawerOpen(false); setCurrentView("home");
    localStorage.removeItem("token");
    localStorage.removeItem("role");
  };

  const RenderAuthenticationScreen = () => {
    const [isLoginMode, setIsLoginMode] = useState(true); 
    const [isAdminPortalMode, setIsAdminPortalMode] = useState(false);
    const [authFormData, setAuthFormData] = useState({ name: "", email: "", password: "", mkey: "" });

    const handleFormSubmitAction = async (event) => {
      event.preventDefault();
      try {
        let endpointUrl = isAdminPortalMode ? "/owner-login" : (isLoginMode ? "/login" : "/register");
        const response = await fetch(`${BACKEND_API_URL}${endpointUrl}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(authFormData)
        });
        const jsonResponseData = await response.json();
        
        if (response.ok) {
          if (!isAdminPortalMode && !isLoginMode) {
            alert("Account has been successfully created! Please proceed to Sign In.");
            setIsLoginMode(true); return;
          }
          const assignedRole = isAdminPortalMode ? "admin" : "student";
          setToken(jsonResponseData.token); setRole(assignedRole);
          localStorage.setItem("token", jsonResponseData.token); localStorage.setItem("role", assignedRole);
          
          if ("Notification" in window && Notification.permission === "default") {
              Notification.requestPermission();
          }

          setCurrentView(isAdminPortalMode ? "admin-orders" : "home");
        } else {
          alert(`Authentication Error: ${jsonResponseData.message}`);
        }
      } catch (error) {
        alert("CRITICAL ERROR: Failed to connect to the backend server.");
      }
    };

    return (
      <div className="flex items-center justify-center p-6 transition-colors duration-300 py-20">
        <div className="bg-white dark:bg-[#151515] p-10 rounded-[2rem] w-full max-w-lg shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-none border border-gray-100 dark:border-gray-800">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-black text-gray-900 dark:text-white tracking-tighter mb-2">TAP 2 EAT</h1>
            <p className="text-gray-500 dark:text-gray-400 font-medium">{isAdminPortalMode ? "Secure Administrative Portal" : (isLoginMode ? "Sign in to order your food." : "Create a new student account.")}</p>
          </div>
          <form onSubmit={handleFormSubmitAction} className="flex flex-col space-y-5">
            {!isAdminPortalMode && !isLoginMode && (
              <div className="flex flex-col"><label className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Full Legal Name</label><input type="text" required onChange={(e) => setAuthFormData({...authFormData, name: e.target.value})} className="w-full bg-gray-50 dark:bg-[#202020] dark:text-white p-4 rounded-2xl outline-none font-bold border border-gray-200 dark:border-gray-800 focus:border-black dark:focus:border-white transition-all" /></div>
            )}
            {!isAdminPortalMode && (
              <><div className="flex flex-col"><label className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Email Address</label><input type="email" required onChange={(e) => setAuthFormData({...authFormData, email: e.target.value})} className="w-full bg-gray-50 dark:bg-[#202020] dark:text-white p-4 rounded-2xl outline-none font-bold border border-gray-200 dark:border-gray-800 focus:border-black dark:focus:border-white transition-all" /></div>
                <div className="flex flex-col"><label className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Secure Password</label><input type="password" required onChange={(e) => setAuthFormData({...authFormData, password: e.target.value})} className="w-full bg-gray-50 dark:bg-[#202020] dark:text-white p-4 rounded-2xl outline-none font-bold border border-gray-200 dark:border-gray-800 focus:border-black dark:focus:border-white transition-all" /></div></>
            )}
            {isAdminPortalMode && (
              <div className="flex flex-col"><label className="text-sm font-bold text-red-700 dark:text-red-400 mb-2 ml-1">Administrator Master Key</label><input type="password" required onChange={(e) => setAuthFormData({...authFormData, mkey: e.target.value})} className="w-full bg-red-50 dark:bg-[#200505] dark:text-white p-4 rounded-2xl outline-none font-bold border border-red-200 dark:border-red-900/50 focus:border-red-500 transition-all" /></div>
            )}
            <button type="submit" className="w-full bg-black text-white dark:bg-white dark:text-black mt-4 py-5 rounded-2xl font-black text-lg hover:scale-[1.02] active:scale-[0.98] transition-all">
              {isAdminPortalMode ? "AUTHENTICATE AS ADMIN" : (isLoginMode ? "SECURE SIGN IN" : "CREATE NEW ACCOUNT")}
            </button>
          </form>
          <div className="mt-10 flex flex-col items-center space-y-5">
             {!isAdminPortalMode && <button onClick={() => setIsLoginMode(!isLoginMode)} className="text-gray-500 hover:text-black dark:hover:text-white font-bold text-sm transition-colors">{isLoginMode ? "First time here? Create an account" : "I already have an account. Take me to Login"}</button>}
             <div className="w-full h-px bg-gray-200 dark:bg-gray-800"></div>
             <button onClick={() => setIsAdminPortalMode(!isAdminPortalMode)} className="text-gray-400 hover:text-gray-900 dark:hover:text-white font-black uppercase tracking-widest text-xs transition-colors">{isAdminPortalMode ? "← Return to Student Login" : "Access System Administrator Portal"}</button>
          </div>
        </div>
      </div>
    );
  };

  const RenderCartDrawer = () => {
    let currentTotalAmount = activeCartItems.reduce((acc, item) => acc + (Number(item.price) * (item.quantity || 1)), 0);
    let maximumPrepTimeRequired = activeCartItems.length > 0 ? Math.max(...activeCartItems.map(item => item.prep_time !== undefined && item.prep_time !== null && item.prep_time !== "" ? Number(item.prep_time) : 15)) : 0;
    
    const futureTimeSlotsArray = ["ASAP"];
    const workingDateObject = new Date(); 
    workingDateObject.setMinutes(Math.ceil(workingDateObject.getMinutes() / 15) * 15);
    for (let slotIndex = 1; slotIndex <= 8; slotIndex++) { 
      workingDateObject.setMinutes(workingDateObject.getMinutes() + 15); 
      futureTimeSlotsArray.push(workingDateObject.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})); 
    }

    const executeCashfreeCheckoutFlow = async () => {
      if (isOrderPlacing) return;
      setIsOrderPlacing(true);

      try {
        const sdkLoaded = await loadCashfreeScript();
        if (!sdkLoaded) {
          setIsOrderPlacing(false);
          return alert("CRITICAL ERROR: Cashfree SDK failed to load.");
        }

        // Save state for failure recovery
        localStorage.setItem("tap2eat_pending_order", JSON.stringify({
          items: activeCartItems,
          pickupTime: selectedPickupTime,
          prepTimeTotal: maximumPrepTimeRequired
        }));

        const secureReturnUrl = window.location.origin;

        const response = await fetch(`${BACKEND_API_URL}/create-cashfree-order`, {
  method: "POST",
  headers: { 
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  },
  body: JSON.stringify({
    items: activeCartItems
  })
});

        const data = await response.json();

        if (response.ok && data.payment_session_id) {
          const cashfree = window.Cashfree({
   mode: "production"
});
          
          cashfree.checkout({
  paymentSessionId: data.payment_session_id,
  redirectTarget: "_self"
});
        } else {
          alert(`Order Creation Failed: ${data.message || 'Stock may be locked or unavailable.'}`);
          setIsOrderPlacing(false);
        }
      } catch (error) {
        alert("Fatal Error connecting to backend for Checkout. Is the server running?");
        setIsOrderPlacing(false);
      }
    };

    const isInstantPickup = maximumPrepTimeRequired === 0;

    return (
      <div className="cart-container-wrapper">
        {isCartDrawerOpen && <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[60] transition-opacity duration-300" onClick={() => setIsCartDrawerOpen(false)}></div>}
        <div className={`fixed top-0 right-0 h-full w-full md:w-[480px] bg-white dark:bg-[#111111] shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[70] transform transition-transform duration-500 flex flex-col ${isCartDrawerOpen ? "translate-x-0" : "translate-x-full"}`}>
          <div className="p-8 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-[#111111] z-10 shrink-0">
            <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Your Active Cart</h2>
            <button onClick={() => setIsCartDrawerOpen(false)} className="text-gray-500 bg-gray-100 dark:bg-gray-800 w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl hover:bg-gray-200 transition-colors">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-4">
            {activeCartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-6">
                <span className="text-8xl grayscale opacity-30">🛒</span>
                <p className="font-bold text-xl">Your cart is completely empty.</p>
                <button onClick={() => { setIsCartDrawerOpen(false); setCurrentView("home"); }} className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-6 py-3 rounded-xl font-bold">Browse Menu</button>
              </div>
            ) : (
              activeCartItems.map((currentItem, index) => (
                <div key={index} className="flex flex-col p-5 bg-white dark:bg-[#1a1a1a] rounded-2xl dark:text-white border border-gray-100 dark:border-gray-800 shadow-sm gap-4">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col"><span className="font-black text-lg">{currentItem.name}</span><span className="text-sm font-bold text-gray-400 mt-1">{currentItem.category}</span></div>
                    <span className="font-black text-xl tracking-tight text-blue-600 dark:text-blue-400">₹{currentItem.price * (currentItem.quantity || 1)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-black uppercase tracking-widest text-gray-400">Quantity</span>
                     <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#111] rounded-xl p-1 border border-gray-200 dark:border-gray-700">
                        <button onClick={() => updateCartQuantity(currentItem.id, -1)} className="w-8 h-8 flex items-center justify-center font-black text-xl hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-600 dark:text-gray-300">-</button>
                        <span className="font-black text-lg w-6 text-center">{currentItem.quantity || 1}</span>
                        <button onClick={() => updateCartQuantity(currentItem.id, 1)} className="w-8 h-8 flex items-center justify-center font-black text-xl hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-600 dark:text-gray-300">+</button>
                     </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {activeCartItems.length > 0 && (
            <div className="p-8 bg-white dark:bg-[#111111] border-t border-gray-100 dark:border-gray-800 z-10 shrink-0">
              <div className={`flex flex-col md:flex-row justify-between items-start md:items-center p-5 rounded-2xl mb-6 border ${isInstantPickup ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30' : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30'}`}>
                <div className="flex items-center gap-3 mb-4 md:mb-0"><span className="text-2xl">{isInstantPickup ? '⚡' : '⏱️'}</span><div className="flex flex-col"><span className={`font-black uppercase tracking-widest text-xs ${isInstantPickup ? 'text-green-700 dark:text-green-400' : 'text-blue-700 dark:text-blue-400'}`}>Estimated Preparation</span><span className={`font-black text-lg ${isInstantPickup ? 'text-green-800 dark:text-green-300' : 'text-blue-800 dark:text-blue-300'}`}>{isInstantPickup ? 'Instant Counter Pickup' : `${maximumPrepTimeRequired} Minutes`}</span></div></div>
                {!isInstantPickup && (
                  <div className="w-full md:w-auto flex flex-col"><label className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-widest mb-2">Schedule Time</label><select value={selectedPickupTime} onChange={(e) => setSelectedPickupTime(e.target.value)} className="w-full bg-white dark:bg-[#202020] dark:text-white text-sm px-4 py-3 rounded-xl outline-none font-bold cursor-pointer border border-blue-200 dark:border-blue-900/50 appearance-none">{futureTimeSlotsArray.map((timeString) => <option key={timeString} value={timeString}>{timeString}</option>)}</select></div>
                )}
              </div>
              <div className="flex justify-between items-end mb-8"><span className="text-gray-500 dark:text-gray-400 font-black uppercase tracking-widest text-sm">Final Amount</span><span className="text-5xl font-black text-gray-900 dark:text-white tracking-tighter">₹{currentTotalAmount}</span></div>
              <button disabled={isOrderPlacing} onClick={executeCashfreeCheckoutFlow} className={`w-full py-5 rounded-2xl font-black text-xl transition-all ${isOrderPlacing ? 'bg-gray-400 text-gray-700 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500' : 'bg-black text-white dark:bg-white dark:text-black hover:scale-[1.02] active:scale-[0.98]'}`}>
                {isOrderPlacing ? <span className="flex items-center justify-center gap-2"><span className="w-5 h-5 border-4 border-gray-600 border-t-white rounded-full animate-spin"></span> Processing...</span> : "PAY SECURELY WITH CASHFREE"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const executeInvoicePrintJob = (selectedOrderObject) => {
    const validatedItemsArray = parseOrderItems(selectedOrderObject.items);
    const temporaryPrintWindow = window.open('', '_blank', 'width=850,height=900');
    temporaryPrintWindow.document.write(`
      <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>INVOICE #${selectedOrderObject.token_number}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
          body { font-family: 'Inter', sans-serif; padding: 50px; color: #000; background-color: #fff; line-height: 1.6; }
          .invoice-header-block { text-align: center; margin-bottom: 50px; border-bottom: 3px solid #000; padding-bottom: 30px; }
          .brand-title { font-size: 48px; font-weight: 900; margin: 0; letter-spacing: -2px; }
          .metadata-grid { display: grid; grid-template-columns: 1fr 1fr; text-align: left; font-size: 14px; margin-top: 30px; background-color: #f9f9f9; padding: 20px; border-radius: 10px; }
          .metadata-label { font-weight: 700; color: #555; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; display: block; }
          .metadata-value { font-weight: 700; font-size: 16px; margin-bottom: 15px; }
          .item-row { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px dashed #ccc; padding-bottom: 15px; font-weight: 700; font-size: 18px; }
          .totals-block { margin-top: 50px; text-align: right; border-top: 3px solid #000; padding-top: 30px; }
        </style>
      </head><body>
        <div class="invoice-header-block"><h1 class="brand-title">TAP 2 EAT</h1><p>Official Customer Receipt</p>
          <div class="metadata-grid">
            <div><span class="metadata-label">Token Number</span><div class="metadata-value">#${selectedOrderObject.token_number}</div><span class="metadata-label">Customer Name</span><div class="metadata-value">${selectedOrderObject.user_name}</div></div>
            <div><span class="metadata-label">Date & Time</span><div class="metadata-value">${new Date(selectedOrderObject.created_at).toLocaleString()}</div><span class="metadata-label">Pickup Schedule</span><div class="metadata-value">${selectedOrderObject.pickup_time}</div></div>
          </div>
        </div>
        <h3 style="text-transform:uppercase; letter-spacing:1px; margin-bottom:30px; color:#555;">Purchased Items</h3>
        ${validatedItemsArray.map(singleItem => `<div class="item-row"><span>${singleItem.quantity || 1}x ${singleItem.name}</span><span>Rs. ${Number(singleItem.price * (singleItem.quantity || 1)).toFixed(2)}</span></div>`).join('')}
        <div class="totals-block">
          <span style="font-weight:700; text-transform:uppercase; color:#666; margin-right:20px;">Final Amount Paid</span>
          <div style="font-size: 40px; font-weight: 900;">Rs. ${Number(selectedOrderObject.total_amount).toFixed(2)}</div>
          <p style="color:#888; font-weight:700; font-size:12px; margin-top:10px;">Bank TXN ID: ${selectedOrderObject.payment_id}</p>
        </div>
      </body></html>
    `);
    temporaryPrintWindow.document.close(); 
    setTimeout(() => { temporaryPrintWindow.print(); }, 500);
  };

  const activeAdminOrdersFeed = databaseLiveOrders.filter(o => o.status !== 'Picked Up');
  const myActiveTokens = databaseLiveOrders.filter(o => o.status !== 'Picked Up').map(o => o.token_number);

  return (
    <div className={isDarkMode ? "dark" : ""}>
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-white/95 dark:bg-[#050505]/95 backdrop-blur-2xl transition-all duration-500 animate-fade-in">
           <div className="w-32 h-32 md:w-48 md:h-48 bg-green-500 rounded-full flex items-center justify-center text-7xl md:text-9xl mb-12 animate-bounce shadow-[0_0_80px_rgba(34,197,94,0.6)] border-8 border-white dark:border-[#050505]">
             🍔
           </div>
           <h1 className="text-6xl md:text-8xl font-black text-gray-900 dark:text-white tracking-tighter mb-4 text-center">TAP 2 EAT.</h1>
           <div className="bg-gray-100 dark:bg-[#151515] px-8 py-4 rounded-full border border-gray-200 dark:border-gray-800">
             <p className="text-xl font-bold text-green-600 dark:text-green-400 uppercase tracking-widest flex items-center gap-3">
               <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span> Payment Secured. Firing up the grill!
             </p>
           </div>
        </div>
      )}

      <div className="min-h-screen w-full bg-gray-50 dark:bg-[#050505] font-sans text-gray-900 dark:text-gray-100 transition-colors duration-300 flex flex-col">
        
        {toastMessage && (
          <div className="fixed top-28 left-1/2 transform -translate-x-1/2 z-[100] bg-gray-900 text-white dark:bg-white dark:text-black px-8 py-4 rounded-full shadow-2xl font-bold flex items-center gap-3">
            <span className="text-xl">✅</span><span className="text-lg">{toastMessage}</span>
          </div>
        )}

        {/* TOP NAVIGATION BAR */}
        <nav className="sticky top-0 z-40 bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-gray-200/50 dark:border-gray-800 px-6 md:px-10 py-5 flex justify-between items-center shadow-sm">
          <div onClick={() => setCurrentView(role === 'admin' ? 'admin-orders' : 'home')} className="flex items-center gap-3 cursor-pointer group">
            <div className="w-10 h-10 bg-black dark:bg-white text-white dark:text-black rounded-xl flex items-center justify-center font-black text-xl group-hover:rotate-12 transition-transform">T2</div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter hidden sm:block">TAP 2 EAT.</h1>
          </div>
          
          <div className="flex items-center space-x-4 md:space-x-8 font-bold text-sm">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-xl hover:scale-110 active:scale-95 transition-transform">{isDarkMode ? '☀️' : '🌙'}</button>
            
            {token && (
              <div className="relative">
                 <button onClick={() => setIsNotificationsMenuOpen(!isNotificationsMenuOpen)} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-xl relative hover:scale-110 active:scale-95 transition-transform">
                   🔔 {notificationsData.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-[#0a0a0a]">{notificationsData.length}</span>}
                 </button>

                 {isNotificationsMenuOpen && (
                   <div className="absolute right-0 mt-5 w-80 bg-white dark:bg-[#151515] shadow-[0_30px_60px_rgba(0,0,0,0.15)] rounded-3xl p-5 border border-gray-100 dark:border-gray-800 z-50">
                     <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3 mb-3"><h3 className="font-black text-lg">Activity Alerts</h3><span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md text-xs">{notificationsData.length} New</span></div>
                     <div className="max-h-72 overflow-y-auto space-y-3 pr-2">
                       {notificationsData.length === 0 ? <div className="flex flex-col items-center justify-center py-8 opacity-50"><span className="text-3xl mb-2">📭</span><p className="text-sm font-bold">You're all caught up!</p></div> : notificationsData.map((notif, idx) => <div key={idx} className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-3 rounded-xl"><p className="text-sm font-bold text-blue-900 dark:text-blue-300">{notif}</p></div>)}
                     </div>
                     {notificationsData.length > 0 && <button onClick={() => setNotificationsData([])} className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-black py-3 rounded-xl mt-4 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Dismiss All Alerts</button>}
                   </div>
                 )}
              </div>
            )}

            {(!token || role === "student") && (
              <div className="hidden md:flex items-center space-x-6">
                <button onClick={() => setCurrentView("home")} className={`text-base transition-colors ${currentView === 'home' ? 'text-black dark:text-white font-black' : 'text-gray-400 hover:text-gray-900 dark:hover:text-white font-bold'}`}>Full Menu</button>
                {token && <button onClick={() => setCurrentView("favourites")} className={`text-base transition-colors flex items-center gap-1 ${currentView === 'favourites' ? 'text-red-500 font-black' : 'text-gray-400 hover:text-red-500 font-bold'}`}><span>❤️</span> Favs</button>}
                {token && <button onClick={() => setCurrentView("history")} className={`text-base transition-colors ${currentView === 'history' ? 'text-black dark:text-white font-black' : 'text-gray-400 hover:text-gray-900 dark:hover:text-white font-bold'}`}>My Receipts</button>}
              </div>
            )}

            {role === "admin" && (
              <div className="hidden md:flex items-center space-x-6">
                <button onClick={() => setCurrentView("admin-orders")} className={`text-base flex items-center gap-2 transition-colors ${currentView === 'admin-orders' ? 'text-black dark:text-white font-black' : 'text-gray-400 hover:text-gray-900 dark:hover:text-white font-bold'}`}>Live Feed <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span></button>
                <button onClick={() => setCurrentView("admin-add")} className={`text-base transition-colors ${currentView === 'admin-add' ? 'text-black dark:text-white font-black' : 'text-gray-400 hover:text-gray-900 dark:hover:text-white font-bold'}`}>Manage Inventory</button>
                <button onClick={() => setCurrentView("admin-revenue")} className={`text-base transition-colors ${currentView === 'admin-revenue' ? 'text-black dark:text-white font-black' : 'text-gray-400 hover:text-gray-900 dark:hover:text-white font-bold'}`}>Revenue Analytics</button>
                <button onClick={() => setCurrentView("admin-history")} className={`text-base transition-colors ${currentView === 'admin-history' ? 'text-black dark:text-white font-black' : 'text-gray-400 hover:text-gray-900 dark:hover:text-white font-bold'}`}>Order History</button>
              </div>
            )}

            <div className="w-px h-8 bg-gray-200 dark:bg-gray-800 hidden md:block"></div>
            
            <div className="flex items-center space-x-3">
              {(!token) ? (
                 <button onClick={() => setCurrentView("login")} className="bg-black text-white dark:bg-white dark:text-black px-6 py-2.5 rounded-full font-black hover:scale-105 transition-transform text-sm md:text-base">
                   Sign In
                 </button>
              ) : (
                <>
                  {role === "student" && (
                    <button onClick={() => setIsCartDrawerOpen(true)} className="flex items-center gap-2 bg-black text-white dark:bg-white dark:text-black px-5 md:px-6 py-3 rounded-full font-black hover:scale-105 active:scale-95 transition-transform">
                      <span className="hidden sm:block">Cart</span><span className="text-lg">🛒</span>
                      {activeCartItems.length > 0 && <span className="bg-white text-black dark:bg-black dark:text-white px-2 py-0.5 rounded-full text-xs">{activeCartItems.reduce((acc, i) => acc + (i.quantity || 1), 0)}</span>}
                    </button>
                  )}
                  <button onClick={executeLogoutFlow} className="hidden md:flex items-center gap-2 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 px-5 py-3 rounded-full font-black hover:bg-red-100 transition-colors">Logout</button>
                </>
              )}
            </div>
          </div>
        </nav>

        {RenderCartDrawer()}

        <main className="max-w-[1600px] mx-auto px-6 md:px-10 pt-10 flex-1 w-full">
          
          {currentView === 'login' && <RenderAuthenticationScreen />}

          {(!token || role === "student") && (currentView === "home" || currentView === "favourites") && (
            <div className="animate-fade-in">
              
              {currentView === "home" && !token && (
                <div className="bg-gradient-to-br from-blue-600 to-indigo-900 text-white rounded-[3rem] p-10 md:p-16 mb-12 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-white opacity-5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                  <div className="relative z-10">
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4">Tap2Eat.</h1>
                    <p className="text-xl md:text-2xl font-bold mb-2">The fast, secure online food ordering platform for our campus.</p>
                    <p className="text-blue-200 mb-8 font-medium text-lg max-w-2xl">Browse our live menu below, place your order securely online, and pick it up fresh from the counter without waiting in line.</p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 opacity-90 max-w-4xl">
                       <div className="bg-white/10 p-5 rounded-2xl backdrop-blur-md border border-white/20 flex items-center gap-4">
                          <span className="text-4xl">🍔</span>
                          <div><h3 className="font-black text-lg leading-tight">Classic Burger</h3><p className="text-blue-200 font-bold">₹120</p></div>
                       </div>
                       <div className="bg-white/10 p-5 rounded-2xl backdrop-blur-md border border-white/20 flex items-center gap-4">
                          <span className="text-4xl">🍟</span>
                          <div><h3 className="font-black text-lg leading-tight">Crispy Fries</h3><p className="text-blue-200 font-bold">₹80</p></div>
                       </div>
                       <div className="bg-white/10 p-5 rounded-2xl backdrop-blur-md border border-white/20 flex items-center gap-4">
                          <span className="text-4xl">🥤</span>
                          <div><h3 className="font-black text-lg leading-tight">Cold Beverage</h3><p className="text-blue-200 font-bold">₹50</p></div>
                       </div>
                    </div>
                  </div>
                </div>
              )}

              {token && role === "student" && currentView === "home" && (
                <div className="bg-gradient-to-r from-gray-900 to-black dark:from-[#111] dark:to-[#050505] text-white rounded-[2rem] p-6 md:p-8 mb-10 flex flex-col md:flex-row justify-between items-center shadow-xl border border-gray-800 animate-fade-in gap-6">
                  <div className="flex items-center gap-6">
                     <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center text-3xl shadow-inner">👨‍🍳</div>
                     <div>
                        <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mb-1 flex items-center gap-2"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> Now Serving Counter</p>
                        <h2 className="text-4xl md:text-5xl font-black text-green-400 tracking-tighter">#{nowServingToken}</h2>
                     </div>
                  </div>
                  <div className="hidden md:block w-px h-16 bg-gray-800"></div>
                  <div className="flex items-center gap-6 text-right">
                     <div>
                        <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mb-1">Your Active Token</p>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter">{myActiveTokens.length > 0 ? `#${myActiveTokens[0]}` : '--'}</h2>
                     </div>
                     <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-3xl shadow-lg border-2 border-blue-400">🎫</div>
                  </div>
                </div>
              )}

              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6">
                <div>
                  <h2 className="text-5xl md:text-6xl font-black tracking-tighter mb-2">{currentView === 'favourites' ? 'Your Favourites ❤️' : 'Explore the Menu'}</h2>
                  <p className="text-gray-500 dark:text-gray-400 font-bold text-lg">{currentView === 'favourites' ? 'Your usual, just one tap away.' : 'Freshly prepared food, ready when you are.'}</p>
                </div>
                {currentView === "home" && (
                  <div className="relative w-full md:w-96 shadow-[0_10px_30px_rgba(0,0,0,0.05)] dark:shadow-none rounded-full">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none"><span className="text-xl opacity-50">🔍</span></div>
                    <input type="text" placeholder="Search for a burger, coffee..." value={searchInputQuery} onChange={(e) => setSearchInputQuery(e.target.value)} className="w-full bg-white dark:bg-[#151515] border border-gray-200 dark:border-gray-800 dark:text-white pl-14 pr-6 py-4 rounded-full outline-none focus:ring-4 focus:ring-black/5 dark:focus:ring-white/5 transition-all font-bold text-lg" />
                  </div>
                )}
              </div>

              {currentView === "home" && (
                <div className="flex space-x-3 overflow-x-auto pb-6 mb-8 hide-scrollbar">
                  {extractedCategoriesList.map(cat => (
                    <button key={cat} onClick={() => setActiveCategoryFilter(cat)} className={`whitespace-nowrap px-8 py-3.5 rounded-full font-black text-sm transition-all duration-300 border-2 ${activeCategoryFilter === cat ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-lg' : 'bg-white dark:bg-[#151515] text-gray-500 border-gray-200 dark:border-gray-800'}`}>{cat}</button>
                  ))}
                </div>
              )}

              {isLoadingMenu ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-white dark:bg-[#151515] rounded-[2.5rem] p-6 border border-gray-100 dark:border-gray-800 h-[380px]">
                      <div className="aspect-square w-full rounded-[2rem] bg-gray-200 dark:bg-gray-800 mb-6"></div><div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-4"></div><div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2 mt-auto"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
                  {dynamicallyFilteredMenu.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-40 bg-white dark:bg-[#151515] rounded-[3rem] border border-gray-100 dark:border-gray-800 border-dashed"><span className="text-8xl mb-6 opacity-50 grayscale">🔍</span><h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">No items found</h3></div>
                  ) : (
                    dynamicallyFilteredMenu.map((dataItem) => {
                      const isSoldOut = dataItem.stock <= 0;
                      const isLowStock = !isSoldOut && dataItem.stock < 10;
                      const isInstantItem = Number(dataItem.prep_time) === 0;
                      const isFavorited = favoriteItemIds.includes(dataItem.id);

                      return (
                        <div key={dataItem.id} className="relative group bg-white dark:bg-[#151515] rounded-[2.5rem] p-6 border border-gray-100 dark:border-gray-800 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:-translate-y-2 transition-all duration-500 flex flex-col">
                          {token && <button onClick={() => toggleItemFavoriteStatus(dataItem.id)} className="absolute top-6 right-6 text-3xl z-10 hover:scale-125 active:scale-90 transition-transform filter drop-shadow-md">{isFavorited ? '❤️' : '🤍'}</button>}
                          
                          {isSoldOut ? <div className="absolute top-6 left-6 bg-red-500 text-white text-xs font-black uppercase px-4 py-2 rounded-full z-10 shadow-lg shadow-red-500/30">Sold Out</div> : isLowStock ? <div className="absolute top-6 left-6 bg-orange-500 text-white text-xs font-black uppercase px-4 py-2 rounded-full z-10 shadow-lg shadow-orange-500/30">Only {dataItem.stock} Left</div> : null}
                          
                          <div className={`aspect-square w-full rounded-[2rem] mb-6 flex items-center justify-center text-8xl transition-colors duration-500 ${isSoldOut ? 'bg-gray-100 dark:bg-[#1a1a1a] opacity-30 grayscale' : 'bg-gray-50 dark:bg-[#202020] group-hover:bg-blue-50 dark:group-hover:bg-[#252525]'}`}>{isInstantItem ? '🧃' : '🍔'}</div>
                          
                          <div className="flex-1 flex flex-col">
                            <h3 className="text-2xl font-black mb-2 text-gray-900 dark:text-white leading-tight">{dataItem.name}</h3>
                            <div className="flex justify-between items-center mb-6 mt-auto"><span className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{dataItem.category}</span><span className={`text-xs font-black px-3 py-1.5 rounded-lg uppercase tracking-wider ${isInstantItem ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}>{isInstantItem ? '⚡ Instant' : `⏱️ ${dataItem.prep_time}m`}</span></div>
                          </div>
                          
                          <div className="flex justify-between items-end border-t border-gray-100 dark:border-gray-800 pt-5 mt-auto">
                            <div className="flex flex-col"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Price</span><span className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter">₹{dataItem.price}</span></div>
                            <button disabled={isSoldOut} onClick={() => {
                               if (!token) {
                                  displayToast("Please sign in to order food.");
                                  setCurrentView("login");
                               } else {
                                  handleAddToCart(dataItem);
                               }
                            }} className={`w-16 h-16 rounded-[1.25rem] flex items-center justify-center text-3xl font-black transition-all duration-300 ${isSoldOut ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed' : 'bg-black text-white dark:bg-white dark:text-black hover:scale-110 shadow-[0_10px_20px_rgba(0,0,0,0.15)] hover:rotate-3'}`}>+</button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {role === "student" && currentView === "history" && (
            <div className="max-w-5xl mx-auto animate-fade-in">
               <div className="mb-12"><h2 className="text-5xl md:text-6xl font-black tracking-tighter mb-4">Your Digital Receipts</h2><p className="text-gray-500 font-bold text-lg">Track active orders or download previous invoices.</p></div>
               <div className="space-y-8">
                 {databaseLiveOrders.length === 0 ? (
                   <div className="flex flex-col items-center justify-center py-32 bg-white dark:bg-[#151515] rounded-[3rem] border border-gray-100 dark:border-gray-800 border-dashed"><span className="text-8xl mb-6 opacity-50 grayscale">🧾</span><h3 className="text-3xl font-black text-gray-900 dark:text-white mb-4">No order history found</h3><button onClick={() => setCurrentView('home')} className="bg-black text-white dark:bg-white dark:text-black px-10 py-4 rounded-2xl font-black text-lg hover:scale-105 transition-transform shadow-xl">Explore Menu to Order</button></div>
                 ) : (
                   databaseLiveOrders.map((orderObject) => {
                     const remainingMinutesClamped = calculateSmartWaitTime(orderObject);
                     const statusIsPreparing = orderObject.status === 'Preparing';
                     const statusIsReady = orderObject.status === 'Ready';
                     const statusIsPickedUp = orderObject.status === 'Picked Up'; 
                     const hasScheduledTime = orderObject.pickup_time !== 'ASAP';
                     const isFullyInstantOrder = Number(orderObject.prep_time_total) === 0;
                     const decodedArrayOfItems = parseOrderItems(orderObject.items);

                     return (
                       <div key={orderObject.id} className={`bg-white dark:bg-[#151515] p-8 md:p-10 rounded-[2.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.03)] dark:shadow-none border transition-colors ${statusIsPickedUp ? 'border-gray-200 dark:border-gray-800 opacity-80' : 'border-gray-100 dark:border-gray-800'}`}>
                         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b border-gray-100 dark:border-gray-800 pb-8 mb-8">
                           <div className="flex-1 w-full">
                             <div className="flex items-center gap-3 mb-4"><p className="text-sm font-black text-gray-400 uppercase tracking-widest">Digital Token</p><span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700"></span><p className="text-sm font-bold text-gray-400">ID: {orderObject.id}</p></div>
                             <h1 className={`text-7xl font-black tracking-tighter mb-4 ${statusIsPickedUp ? 'text-gray-400 dark:text-gray-600 line-through' : 'text-gray-900 dark:text-white'}`}>#{orderObject.token_number}</h1>
                             
                             {/* Custom Inline Order Progress Tracker */}
                             <div className="flex items-center w-full max-w-md my-6">
                               <div className={`flex flex-col items-center ${statusIsPreparing || statusIsReady || statusIsPickedUp ? 'text-yellow-600 dark:text-yellow-500' : 'text-gray-400'}`}>
                                 <div className={`w-4 h-4 rounded-full mb-2 shadow-md ${statusIsPreparing || statusIsReady || statusIsPickedUp ? 'bg-yellow-500' : 'bg-gray-300 dark:bg-gray-700'}`}></div>
                                 <span className="text-[10px] font-black uppercase tracking-widest text-center">Preparing</span>
                               </div>
                               <div className={`flex-1 h-1.5 mx-2 rounded-full transition-colors duration-500 ${statusIsReady || statusIsPickedUp ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-800'}`}></div>
                               <div className={`flex flex-col items-center ${statusIsReady || statusIsPickedUp ? 'text-green-600 dark:text-green-500' : 'text-gray-400'}`}>
                                 <div className={`w-4 h-4 rounded-full mb-2 shadow-md ${statusIsReady || statusIsPickedUp ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}></div>
                                 <span className="text-[10px] font-black uppercase tracking-widest text-center">Ready</span>
                               </div>
                               <div className={`flex-1 h-1.5 mx-2 rounded-full transition-colors duration-500 ${statusIsPickedUp ? 'bg-gray-600 dark:bg-gray-400' : 'bg-gray-200 dark:bg-gray-800'}`}></div>
                               <div className={`flex flex-col items-center ${statusIsPickedUp ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400'}`}>
                                 <div className={`w-4 h-4 rounded-full mb-2 shadow-md ${statusIsPickedUp ? 'bg-gray-500' : 'bg-gray-300 dark:bg-gray-700'}`}></div>
                                 <span className="text-[10px] font-black uppercase tracking-widest text-center">Picked Up</span>
                               </div>
                             </div>

                             <div className="flex flex-wrap items-center gap-3 mt-4"><span className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-blue-100 dark:border-blue-900/50 shadow-sm">{hasScheduledTime ? `⏰ Scheduled: ${orderObject.pickup_time}` : (isFullyInstantOrder ? '⚡ Instant Pickup' : '🏃 ASAP Pickup')}</span></div>
                           </div>
                           <div className="w-full md:w-auto md:min-w-[250px]">
                              {statusIsPreparing ? (
                                <div className="bg-gray-50 dark:bg-[#202020] p-6 rounded-[2rem] border border-gray-200 dark:border-gray-800 text-center md:text-right shadow-inner">
                                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Estimated Wait</p>
                                  {isFullyInstantOrder ? <p className="text-2xl font-black text-green-600 dark:text-green-400">Head to Counter!</p> : hasScheduledTime ? <p className="text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tighter">Scheduled</p> : (
                                    <div className="flex flex-col items-center md:items-end"><p className="text-5xl font-black text-orange-600 dark:text-orange-500 tracking-tighter animate-pulse">{remainingMinutesClamped} <span className="text-2xl">min</span></p><div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full mt-4 overflow-hidden"><div className="bg-orange-500 h-full rounded-full animate-pulse" style={{width: '75%'}}></div></div><p className="text-[10px] text-gray-400 mt-2 tracking-widest uppercase">Based on Kitchen Queue</p></div>
                                  )}
                                </div>
                              ) : statusIsReady ? (
                                <div className="bg-green-50 dark:bg-green-900/10 p-6 rounded-[2rem] border border-green-200 dark:border-green-900/50 text-center md:text-right shadow-[0_0_30px_rgba(34,197,94,0.1)]">
                                  <p className="text-xs font-black text-green-700 dark:text-green-500 uppercase tracking-widest mb-2">Order Status</p><p className="text-3xl font-black text-green-600 dark:text-green-400 tracking-tighter">Ready to Eat!</p><p className="text-sm font-bold text-green-600 dark:text-green-500 mt-2 opacity-70">Please show token at counter.</p>
                                </div>
                              ) : (
                                <div className="bg-gray-100 dark:bg-[#202020] p-6 rounded-[2rem] border border-gray-200 dark:border-gray-800 text-center md:text-right shadow-inner">
                                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Order Status</p><p className="text-2xl font-black text-gray-600 dark:text-gray-400 tracking-tighter">Order Picked Up ✅</p><p className="text-sm font-bold text-gray-500 mt-2 opacity-70">Hope you enjoyed your meal!</p>
                                  <button onClick={() => handleReorder(orderObject.items)} className="bg-white dark:bg-[#151515] border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-black text-xs px-4 py-3 rounded-lg mt-4 uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-full shadow-sm">↻ Reorder Items</button>
                                </div>
                              )}
                           </div>
                         </div>
                         <div className="mb-8 p-6 bg-gray-50 dark:bg-[#0a0a0a] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-inner">
                           <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Items Included in this Order</p>
                           <div className="space-y-4">
                             {decodedArrayOfItems.map((item, index) => (
                               <div key={index} className="flex justify-between items-center text-gray-800 dark:text-gray-200"><div className="flex items-center gap-3"><span className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-800 text-xs font-black flex items-center justify-center text-gray-500">{item.quantity || 1}</span><span className="font-black text-lg">{item.name}</span></div><span className="font-black text-lg">₹{item.price * (item.quantity || 1)}</span></div>
                             ))}
                           </div>
                         </div>
                         <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-t border-gray-100 dark:border-gray-800 pt-8 gap-6">
                            <div><p className="text-sm font-bold text-gray-500 mb-2 bg-gray-100 dark:bg-gray-800 inline-block px-3 py-1 rounded-lg">📅 {new Date(orderObject.created_at).toLocaleString()}</p><div className="flex flex-col mt-2"><span className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Total Authorized Amount</span><h2 className="text-5xl font-black text-gray-900 dark:text-white tracking-tighter">₹{orderObject.total_amount}</h2></div></div>
                            <button onClick={() => executeInvoicePrintJob(orderObject)} className="w-full md:w-auto bg-black text-white dark:bg-white dark:text-black px-8 py-4 rounded-2xl font-black text-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center gap-3 shadow-xl"><span>Download Official Invoice</span><span className="text-2xl">⬇️</span></button>
                         </div>
                       </div>
                     );
                   })
                 )}
               </div>
            </div>
          )}

          {role === "admin" && currentView === "admin-orders" && (
            <div className="max-w-[1600px] mx-auto animate-fade-in">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6 border-b border-gray-200 dark:border-gray-800 pb-8">
                 <div><h2 className="text-5xl md:text-6xl font-black tracking-tighter flex items-center gap-5 mb-3">Live Kitchen Feed <span className="bg-green-500 w-5 h-5 rounded-full animate-pulse shadow-[0_0_20px_rgba(34,197,94,0.8)] border-2 border-white dark:border-black"></span></h2><p className="text-gray-500 font-bold text-lg">Active queue. Colored borders indicate wait times.</p></div>
                 <div className="bg-white dark:bg-[#151515] px-8 py-4 rounded-2xl font-black text-xl shadow-[0_10px_30px_rgba(0,0,0,0.05)] border border-gray-200 dark:border-gray-800 flex items-center gap-4"><span className="text-gray-400 uppercase tracking-widest text-xs">Queue Length</span><span className="text-4xl tracking-tighter">{activeAdminOrdersFeed.length}</span></div>
               </div>
               <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                 {activeAdminOrdersFeed.length === 0 ? (
                   <div className="col-span-full flex flex-col items-center justify-center py-40 bg-white dark:bg-[#151515] rounded-[3rem] border border-gray-200 dark:border-gray-800 border-dashed"><span className="text-8xl mb-6 opacity-30 grayscale">👨‍🍳</span><h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Kitchen is absolutely clear</h3><p className="text-gray-500 font-bold">Waiting for new incoming network requests...</p></div>
                 ) : (
                   activeAdminOrdersFeed.map((adminOrderObject) => {
                     const isFutureSchedule = adminOrderObject.pickup_time !== 'ASAP';
                     const isInstantTakeout = Number(adminOrderObject.prep_time_total) === 0;
                     const safelyParsedItems = parseOrderItems(adminOrderObject.items);
                     const isOrderCompleted = adminOrderObject.status === 'Ready';
                     
                     // SMART QUEUE COLORING (PART 3)
                     const queueColorClass = getKitchenQueueColor(adminOrderObject);

                     return (
                       <div key={adminOrderObject.id} className={`bg-white dark:bg-[#151515] p-8 rounded-[2.5rem] shadow-[0_15px_40px_rgba(0,0,0,0.05)] border border-gray-200 dark:border-gray-800 border-t-[12px] relative overflow-hidden transition-all duration-500 ${queueColorClass}`}>
                         <div className="absolute top-6 right-6">
                           {isFutureSchedule ? <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-black px-6 py-2 rounded-xl text-sm uppercase tracking-widest shadow-lg border border-purple-200 dark:border-purple-800 animate-pulse flex items-center gap-2"><span>⏰</span> Pre-order: {adminOrderObject.pickup_time}</div> : isInstantTakeout ? <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-black px-6 py-2 rounded-xl text-sm uppercase tracking-widest shadow-lg border border-green-200 dark:border-green-800 flex items-center gap-2"><span>⚡</span> Instant Out</div> : <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-black px-5 py-2 rounded-xl text-xs uppercase tracking-widest border border-blue-200 dark:border-blue-900/50">Normal ASAP</div>}
                         </div>
                         <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2 mt-4">Kitchen Token</p>
                         <h1 className="text-7xl font-black mb-2 text-gray-900 dark:text-white tracking-tighter">#{adminOrderObject.token_number}</h1>
                         <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-xl mb-8 inline-block"><p className="text-sm font-bold text-gray-600 dark:text-gray-400">Customer: <span className="text-blue-600 dark:text-blue-400 font-black">{adminOrderObject.user_name}</span></p></div>
                         <div className="bg-white dark:bg-[#0a0a0a] p-6 rounded-[2rem] mb-8 border border-gray-200 dark:border-gray-800 shadow-sm">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Preparation List</p>
                            <div className="space-y-4">
                              {safelyParsedItems.map((individualItem, itemIdx) => (
                                <div key={itemIdx} className="font-black text-xl flex items-start gap-4 text-gray-900 dark:text-white"><div className={`mt-1.5 shrink-0 w-3 h-3 rounded-full shadow-sm ${Number(individualItem.prep_time) === 0 ? 'bg-green-500' : 'bg-blue-600 dark:bg-blue-400'}`}></div><div className="flex-1 leading-tight"><span className="text-gray-400 mr-2">{individualItem.quantity || 1}x</span>{individualItem.name}</div></div>
                              ))}
                            </div>
                         </div>
                         <div className="flex flex-col gap-6 border-t border-gray-200 dark:border-gray-800 pt-6 mt-auto">
                           <div className="flex justify-between items-end"><div className="flex flex-col"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Value</span><span className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter">₹{adminOrderObject.total_amount}</span></div><div className="text-right"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Time Logged</span><span className="text-sm font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">{new Date(adminOrderObject.created_at).toLocaleTimeString()}</span></div></div>
                           <div className="relative w-full">
                             <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-2">Update Kitchen Status</label>
                             <select disabled={isAdminUpdating} value={adminOrderObject.status} onChange={async (event) => { 
                                 const targetStatus = event.target.value; setIsAdminUpdating(true);
                                 try {
                                   const response = await fetch(`${BACKEND_API_URL}/admin/orders/${adminOrderObject.id}/status`, { method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ status: targetStatus }) });
                                   if (response.ok) {
                                     displayToast(targetStatus === 'Picked Up' ? `Token #${adminOrderObject.token_number} cleared from queue.` : `Token #${adminOrderObject.token_number} marked as ${targetStatus}`);
                                     setDatabaseLiveOrders(prev => prev.map(o => o.id === adminOrderObject.id ? {...o, status: targetStatus} : o));
                                   } else alert("Database failed to update status.");
                                 } catch(e) { console.error(e); } finally { setIsAdminUpdating(false); }
                               }} className={`w-full p-6 rounded-2xl font-black text-xl uppercase tracking-widest outline-none cursor-pointer appearance-none shadow-[0_10px_20px_rgba(0,0,0,0.1)] dark:shadow-none border-2 transition-colors ${isAdminUpdating ? 'opacity-50 cursor-not-allowed' : ''} ${isOrderCompleted ? 'bg-green-500 border-green-400 text-white' : 'bg-yellow-400 border-yellow-300 text-black hover:bg-yellow-300'}`}>
                                <option value="Preparing">IN KITCHEN: Preparing</option><option value="Ready">DONE: Ready for Pickup</option><option value="Picked Up">DELIVERED: Order Picked Up</option>
                             </select>
                             <div className="absolute right-6 top-12 pointer-events-none text-xl opacity-50">▼</div>
                           </div>
                         </div>
                       </div>
                     );
                   })
                 )}
               </div>
            </div>
          )}

          {/* ADMIN DASHBOARD: REVENUE & ANALYTICS */}
          {role === "admin" && currentView === "admin-revenue" && (
             <div className="max-w-7xl mx-auto animate-fade-in">
               <div className="mb-12 border-b border-gray-200 dark:border-gray-800 pb-8">
                 <h2 className="text-5xl md:text-6xl font-black tracking-tighter mb-4">Revenue & Analytics Dashboard</h2>
                 <p className="text-gray-500 font-bold text-lg">Real-time business insights and historical sales data.</p>
               </div>
               
               {revenueData ? (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-gradient-to-br from-green-400 to-green-600 p-8 rounded-[2.5rem] shadow-xl text-white">
                        <p className="text-sm font-black uppercase tracking-widest mb-2 opacity-80">Today's Total Revenue</p>
                        <h3 className="text-6xl font-black tracking-tighter">₹{revenueData.todayRevenue}</h3>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-8 rounded-[2.5rem] shadow-xl text-white">
                        <p className="text-sm font-black uppercase tracking-widest mb-2 opacity-80">Today's Total Orders</p>
                        <h3 className="text-6xl font-black tracking-tighter">{revenueData.todayOrdersCount}</h3>
                    </div>
                    <div className="bg-gradient-to-br from-orange-400 to-red-500 p-8 rounded-[2.5rem] shadow-xl text-white">
                        <p className="text-sm font-black uppercase tracking-widest mb-2 opacity-80">Peak Order Hour</p>
                        <h3 className="text-6xl font-black tracking-tighter">{revenueData.peakHour || '--:--'}</h3>
                    </div>
                 </div>
               ) : (
                 <div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-40 rounded-[2.5rem] w-full"></div>
               )}
             </div>
          )}

          {role === "admin" && currentView === "admin-history" && (
             <div className="max-w-7xl mx-auto animate-fade-in">
               <div className="mb-12 border-b border-gray-200 dark:border-gray-800 pb-8">
                 <h2 className="text-5xl md:text-6xl font-black tracking-tighter mb-4">Complete Order Ledger</h2>
                 <p className="text-gray-500 font-bold text-lg">System-wide record of every transaction and token placed.</p>
               </div>
               
               <div className="bg-white dark:bg-[#151515] rounded-[3rem] shadow-sm border border-gray-200 dark:border-gray-800 overflow-x-auto p-4">
                  <table className="w-full text-left min-w-[1000px] border-collapse">
                    <thead className="bg-gray-50 dark:bg-[#202020] rounded-2xl">
                      <tr>
                        <th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500 rounded-l-2xl">Token & Customer</th><th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500">Date/Time</th><th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500">Amount Paid</th><th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500">Status</th><th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500 rounded-r-2xl text-right">Payment ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {databaseLiveOrders.length === 0 ? (
                        <tr><td colSpan="5" className="p-10 text-center font-bold text-gray-500">No order history available.</td></tr>
                      ) : (
                        databaseLiveOrders.map((histObj) => {
                          const isComplete = histObj.status === 'Picked Up';
                          return (
                            <tr key={histObj.id} className="hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors group">
                              <td className="p-6">
                                <div className="flex flex-col">
                                  <span className="font-black text-gray-900 dark:text-white text-2xl tracking-tighter">#{histObj.token_number}</span>
                                  <span className="text-sm font-bold text-gray-500">{histObj.user_name}</span>
                                </div>
                              </td>
                              <td className="p-6"><span className="font-bold text-gray-600 dark:text-gray-400">{new Date(histObj.created_at).toLocaleString()}</span></td>
                              <td className="p-6 font-black text-gray-900 dark:text-white text-xl tracking-tighter">₹{histObj.total_amount}</td>
                              <td className="p-6"><span className={`font-black text-xs px-3 py-1.5 rounded-lg border uppercase tracking-widest ${isComplete ? 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' : 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400'}`}>{histObj.status}</span></td>
                              <td className="p-6 text-right"><span className="text-xs font-mono text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">{histObj.payment_id}</span></td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
               </div>
             </div>
          )}

          {role === "admin" && currentView === "admin-add" && (
             <div className="max-w-7xl mx-auto animate-fade-in">
               <div className="mb-12 border-b border-gray-200 dark:border-gray-800 pb-8">
                 <h2 className="text-5xl md:text-6xl font-black tracking-tighter mb-4">Inventory & Database</h2>
                 <p className="text-gray-500 font-bold text-lg">Manage menu items, prices, and live stock tracking.</p>
               </div>
               
               <div className="bg-white dark:bg-[#151515] p-10 md:p-14 rounded-[3rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] dark:shadow-none border border-gray-200 dark:border-gray-800 mb-16 relative overflow-hidden">
                 <div className="absolute -top-32 -right-32 w-96 h-96 bg-gray-50 dark:bg-[#1a1a1a] rounded-full blur-3xl -z-10"></div>
                 <h3 className="text-3xl font-black mb-10 dark:text-white flex items-center gap-4"><span className="bg-black text-white dark:bg-white dark:text-black w-12 h-12 flex items-center justify-center rounded-xl text-2xl">+</span>Publish New Catalog Item</h3>
                 <form onSubmit={async (event) => { 
                      event.preventDefault(); 
                      setIsAdminUpdating(true);
                      const requestBody = { name: event.target.name.value, price: Number(event.target.price.value), stock: Number(event.target.stock.value), prep_time: Number(event.target.prep.value), category: event.target.category.value }; 
                      try {
                        const submitResponse = await fetch(`${BACKEND_API_URL}/menu`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(requestBody) }); 
                        if (submitResponse.ok) { 
                          displayToast("Successfully published to the database!"); 
                          const updatedMenu = await fetch(`${BACKEND_API_URL}/menu`);
                          setMasterMenuItems(await updatedMenu.json()); 
                          event.target.reset(); 
                        } else alert(`Error: ${(await submitResponse.json()).message}`);
                      } catch (e) { alert("Database Connection Failed."); } finally { setIsAdminUpdating(false); }
                   }} className="grid grid-cols-1 md:grid-cols-6 gap-6">
                   <div className="md:col-span-3 flex flex-col"><label className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 ml-2">Public Item Name</label><input name="name" type="text" placeholder="e.g. Double Cheeseburger" required className="w-full bg-gray-50 dark:bg-[#202020] dark:text-white p-5 rounded-2xl outline-none focus:bg-white dark:focus:bg-[#252525] focus:ring-4 focus:ring-black/10 dark:focus:ring-white/10 font-bold border border-gray-200 dark:border-gray-800 text-lg transition-all" /></div>
                   <div className="md:col-span-1 flex flex-col"><label className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 ml-2">Cost (₹)</label><input name="price" type="number" placeholder="150" required className="w-full bg-gray-50 dark:bg-[#202020] dark:text-white p-5 rounded-2xl outline-none focus:bg-white dark:focus:bg-[#252525] focus:ring-4 focus:ring-black/10 dark:focus:ring-white/10 font-black border border-gray-200 dark:border-gray-800 text-lg transition-all" /></div>
                   <div className="md:col-span-2 flex flex-col"><label className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 ml-2">Initial Inventory Count</label><input name="stock" type="number" placeholder="20" required className="w-full bg-gray-50 dark:bg-[#202020] dark:text-white p-5 rounded-2xl outline-none focus:bg-white dark:focus:bg-[#252525] focus:ring-4 focus:ring-black/10 dark:focus:ring-white/10 font-black text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-800 text-lg transition-all" /></div>
                   <div className="md:col-span-2 flex flex-col"><label className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 ml-2">Preparation Minutes (0 = Instant)</label><input name="prep" type="number" min="0" placeholder="15" required className="w-full bg-gray-50 dark:bg-[#202020] dark:text-white p-5 rounded-2xl outline-none focus:bg-white dark:focus:bg-[#252525] focus:ring-4 focus:ring-black/10 dark:focus:ring-white/10 font-black border border-gray-200 dark:border-gray-800 text-lg transition-all" /></div>
                   <div className="md:col-span-2 flex flex-col relative"><label className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 ml-2">Catalog Category</label><select name="category" required className="w-full bg-gray-50 dark:bg-[#202020] dark:text-white p-5 rounded-2xl outline-none focus:bg-white dark:focus:bg-[#252525] focus:ring-4 focus:ring-black/10 dark:focus:ring-white/10 font-bold border border-gray-200 dark:border-gray-800 text-lg appearance-none cursor-pointer transition-all"><option value="Fast Food">Fast Food</option><option value="Meals">Meals</option><option value="Beverages">Beverages</option><option value="Snacks">Snacks</option></select><div className="absolute right-5 bottom-6 pointer-events-none text-gray-400">▼</div></div>
                   <div className="md:col-span-2 flex flex-col justify-end"><button disabled={isAdminUpdating} type="submit" className={`w-full font-black p-5 rounded-2xl transition-transform shadow-[0_15px_30px_rgba(0,0,0,0.15)] dark:shadow-[0_15px_30px_rgba(255,255,255,0.1)] text-lg h-[64px] ${isAdminUpdating ? 'bg-gray-400 cursor-not-allowed' : 'bg-black text-white dark:bg-white dark:text-black hover:scale-[1.02] active:scale-[0.98]'}`}>PUBLISH TO DATABASE</button></div>
                 </form>
               </div>

               <div className="mb-8"><h3 className="text-2xl font-black mb-2 dark:text-white">Active Database Elements</h3><p className="text-gray-500 font-bold">Total entries: {masterMenuItems.length}</p></div>

               <div className="bg-white dark:bg-[#151515] rounded-[3rem] shadow-sm border border-gray-200 dark:border-gray-800 overflow-x-auto p-4">
                  <table className="w-full text-left min-w-[1000px] border-collapse">
                    <thead className="bg-gray-50 dark:bg-[#202020] rounded-2xl">
                      <tr>
                        <th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500 rounded-l-2xl">Primary Key / Name</th><th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500">Classification</th><th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500">Retail Cost</th><th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500">Time Logic</th><th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500">Live Quantity Matrix</th><th className="p-6 font-black uppercase text-xs tracking-widest text-gray-500 rounded-r-2xl text-right">Destructive Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {masterMenuItems.map((catalogObj) => {
                        const isDatabaseZero = catalogObj.stock <= 0;
                        const isDatabaseLow = !isDatabaseZero && catalogObj.stock <= 5;
                        const isDatabaseInstant = Number(catalogObj.prep_time) === 0;

                        return (
                          <tr key={catalogObj.id} className="hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors group">
                            <td className="p-6"><div className="flex flex-col"><span className="font-black text-gray-900 dark:text-white text-xl">{catalogObj.name}</span><span className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">ID: {catalogObj.id}</span></div></td>
                            <td className="p-6"><span className="font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">{catalogObj.category || 'General'}</span></td>
                            <td className="p-6 font-black text-gray-900 dark:text-white text-2xl tracking-tighter">₹{catalogObj.price}</td>
                            <td className="p-6"><span className={`font-black text-sm px-3 py-1.5 rounded-lg border ${isDatabaseInstant ? 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/50' : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/50'}`}>{isDatabaseInstant ? '⚡ Instant' : `⏱️ ${catalogObj.prep_time}m`}</span></td>
                            <td className="p-6">
                              <div className="flex items-center space-x-3 bg-gray-50 dark:bg-[#202020] w-fit p-2.5 rounded-2xl border border-gray-200 dark:border-gray-800">
                                <span className={`font-black text-2xl w-12 text-center tracking-tighter ${isDatabaseZero ? 'text-gray-300 dark:text-gray-700' : isDatabaseLow ? 'text-red-500' : 'text-green-600 dark:text-green-500'}`}>{catalogObj.stock}</span>
                                <div className="h-8 w-px bg-gray-300 dark:bg-gray-700"></div>
                                <input 
                                  type="number" 
                                  placeholder="Qty" 
                                  min="1"
                                  value={stockInputs[catalogObj.id] || ''} 
                                  onChange={(e) => setStockInputs({...stockInputs, [catalogObj.id]: Math.max(1, Number(e.target.value))})} 
                                  className="w-16 bg-white dark:bg-[#151515] border border-gray-200 dark:border-gray-700 text-center font-bold outline-none rounded-lg py-1.5 dark:text-white"
                                />
                                <div className="flex flex-col gap-1">
                                  <button disabled={isAdminUpdating} onClick={async() => { 
                                     const customVal = stockInputs[catalogObj.id] || 1;
                                     setIsAdminUpdating(true); 
                                     await fetch(`${BACKEND_API_URL}/menu/${catalogObj.id}/stock`, { method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ stock: catalogObj.stock + customVal }) }); 
                                     const refreshReq = await fetch(`${BACKEND_API_URL}/menu`); setMasterMenuItems(await refreshReq.json()); 
                                     setStockInputs({...stockInputs, [catalogObj.id]: ''}); 
                                     setIsAdminUpdating(false); 
                                  }} className="w-8 h-5 flex items-center justify-center bg-white dark:bg-gray-800 rounded text-gray-500 hover:bg-green-100 hover:text-green-600 dark:hover:bg-green-900/40 dark:hover:text-green-400 font-black shadow-sm border border-gray-100 dark:border-gray-700 disabled:opacity-50">+</button>
                                  
                                  <button disabled={isAdminUpdating} onClick={async() => { 
                                     const customVal = stockInputs[catalogObj.id] || 1;
                                     setIsAdminUpdating(true); 
                                     await fetch(`${BACKEND_API_URL}/menu/${catalogObj.id}/stock`, { method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ stock: Math.max(catalogObj.stock - customVal, 0) }) }); 
                                     const refreshReq = await fetch(`${BACKEND_API_URL}/menu`); setMasterMenuItems(await refreshReq.json()); 
                                     setStockInputs({...stockInputs, [catalogObj.id]: ''}); 
                                     setIsAdminUpdating(false); 
                                  }} className="w-8 h-5 flex items-center justify-center bg-white dark:bg-gray-800 rounded text-gray-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400 font-black shadow-sm border border-gray-100 dark:border-gray-700 disabled:opacity-50">-</button>
                                </div>
                              </div>
                            </td>
                            <td className="p-6 text-right">
                              <button disabled={isAdminUpdating} onClick={async() => { const userConfirmed = window.confirm(`WARNING: Purge ${catalogObj.name}?`); if (userConfirmed) { setIsAdminUpdating(true); await fetch(`${BACKEND_API_URL}/menu/${catalogObj.id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } }); const refreshReq = await fetch(`${BACKEND_API_URL}/menu`); setMasterMenuItems(await refreshReq.json()); displayToast(`System: ${catalogObj.name} entity purged.`); setIsAdminUpdating(false); } }} className="text-red-600 dark:text-red-400 font-black bg-red-50 dark:bg-red-900/10 px-6 py-4 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-200 dark:border-red-900/50 uppercase tracking-widest text-xs shadow-sm opacity-0 group-hover:opacity-100 disabled:opacity-50">Terminate</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
               </div>
             </div>
          )}

          {/* ======================================================== */}
          {/* STATIC LEGAL PAGES (MANDATORY FOR PAYMENT COMPLIANCE) */}
          {/* ======================================================== */}
          {currentView === "about" && (
            <div className="max-w-3xl mx-auto py-10 animate-fade-in min-h-[50vh]">
               <h2 className="text-5xl font-black mb-8 dark:text-white tracking-tighter">About Tap2Eat</h2>
               <div className="bg-white dark:bg-[#151515] p-10 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 text-lg text-gray-600 dark:text-gray-400 leading-relaxed font-medium">
                  <p className="mb-6"><strong className="text-gray-900 dark:text-white">TAP2EAT is a digital ordering and payment facilitation platform connecting institutional customers with an existing canteen service provider.</strong></p>
                  <p className="mb-6">The platform does not manufacture, store, or sell food. Food preparation and regulatory compliance remain the sole responsibility of the canteen operator.</p>
                  <p>By digitizing the canteen queue, we ensure that ordering is highly efficient and your precious time is saved.</p>
               </div>
            </div>
          )}

          {currentView === "terms" && (
            <div className="max-w-3xl mx-auto py-10 animate-fade-in min-h-[50vh]">
               <h2 className="text-5xl font-black mb-8 dark:text-white tracking-tighter">Terms & Conditions</h2>
               <div className="bg-white dark:bg-[#151515] p-10 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 leading-relaxed font-medium space-y-6">
                  <p className="text-lg font-bold text-gray-900 dark:text-white border-l-4 border-blue-500 pl-4">A digital ordering and payment facilitation platform connecting institutional customers with an existing canteen service provider. The platform does not manufacture, store, or sell food. Food preparation and regulatory compliance remain the responsibility of the canteen operator.</p>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white">1. Platform Liability</h3>
                  <p>The Platform only facilitates order placement. We are not responsible for the quality, safety, or hygiene of the food provided by the canteen operator.</p>
               </div>
            </div>
          )}

          {currentView === "refund" && (
            <div className="max-w-3xl mx-auto py-10 animate-fade-in min-h-[50vh]">
               <h2 className="text-5xl font-black mb-8 dark:text-white tracking-tighter">Refund Policy</h2>
               <div className="bg-white dark:bg-[#151515] p-10 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 leading-relaxed font-medium space-y-6">
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white">Cancellation & Refunds</h3>
                  <p>Refunds are only issued if a payment is successfully charged but the order fails to generate in our system due to a technical error.</p>
                  <p>If eligible, refunds are processed and credited back to the original payment method within 5–7 business days.</p>
                  <p>Orders that are marked as "Preparing" by the kitchen cannot be cancelled or refunded.</p>
               </div>
            </div>
          )}

          {currentView === "contact" && (
            <div className="max-w-3xl mx-auto py-10 animate-fade-in min-h-[50vh]">
               <h2 className="text-5xl font-black mb-8 dark:text-white tracking-tighter">Contact Us</h2>
               <div className="bg-white dark:bg-[#151515] p-10 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800">
                  <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 font-medium">Have a question regarding your order, a refund request, or feedback about our platform? We are here to help.</p>
                  <div className="space-y-6">
                     <div className="flex items-center gap-4 p-5 bg-gray-50 dark:bg-[#202020] rounded-2xl border border-gray-200 dark:border-gray-700">
                        <span className="text-3xl">📧</span>
                        <div><p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Email Support</p><a href="mailto:NITHISHSENTHIL2025@GMAIL.COM" className="text-xl font-bold text-gray-900 dark:text-white hover:text-blue-600 transition-colors">NITHISHSENTHIL2025@GMAIL.COM</a></div>
                     </div>
                     <div className="flex items-center gap-4 p-5 bg-gray-50 dark:bg-[#202020] rounded-2xl border border-gray-200 dark:border-gray-700">
                        <span className="text-3xl">📞</span>
                        <div><p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Phone Helpline</p><p className="text-xl font-bold text-gray-900 dark:text-white">+91 8072528506</p></div>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {currentView === "privacy" && (
            <div className="max-w-3xl mx-auto py-10 animate-fade-in min-h-[50vh]">
               <h2 className="text-5xl font-black mb-8 dark:text-white tracking-tighter">Privacy Policy</h2>
               <div className="bg-white dark:bg-[#151515] p-10 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 leading-relaxed font-medium space-y-6">
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white">Data Collection & Usage</h3>
                  <p>Tap2Eat respects your privacy. When you use our platform, we collect basic information such as your name and email address strictly for the purpose of creating your account, tracking your orders, and generating digital receipts.</p>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white">Secure Payments</h3>
                  <p>All online transactions are securely processed through Cashfree. We do not store, process, or have access to your credit card numbers, UPI details, or banking passwords on our servers.</p>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white">Data Sharing</h3>
                  <p>We do not sell, rent, or trade your personal information with any third-party marketing agencies or external entities.</p>
               </div>
            </div>
          )}
        </main>

        <footer className="w-full mt-auto border-t border-gray-200 dark:border-gray-800 py-10 px-6 bg-white dark:bg-[#050505]">
          <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-lg flex items-center justify-center font-black text-sm">T2</div>
              <span className="font-black text-gray-900 dark:text-white tracking-tighter text-lg">TAP 2 EAT.</span>
            </div>
            
            <div className="flex flex-wrap justify-center gap-6 md:gap-10 text-sm font-bold text-gray-500">
               <button onClick={() => { setCurrentView('terms'); window.scrollTo(0,0); }} className="hover:text-black dark:hover:text-white transition-colors">Terms of Service</button>
               <button onClick={() => { setCurrentView('refund'); window.scrollTo(0,0); }} className="hover:text-black dark:hover:text-white transition-colors">Refund Policy</button>
               <button onClick={() => { setCurrentView('privacy'); window.scrollTo(0,0); }} className="hover:text-black dark:hover:text-white transition-colors">Privacy Policy</button>
               <button onClick={() => { setCurrentView('contact'); window.scrollTo(0,0); }} className="hover:text-black dark:hover:text-white transition-colors">Contact Support</button>
            </div>
          </div>
          
          <div className="max-w-[1600px] mx-auto text-center border-t border-gray-200 dark:border-gray-800 pt-6">
             <p className="text-[10px] text-gray-400 max-w-4xl mx-auto leading-relaxed uppercase tracking-widest font-bold mb-4">
                A digital ordering and payment facilitation platform connecting institutional customers with an existing canteen service provider. The platform does not manufacture, store, or sell food. Food preparation and regulatory compliance remain the responsibility of the canteen operator.
             </p>
             <p className="text-xs font-bold text-gray-500">Operated by S NITHISH | Email: NITHISHSENTHIL2025@GMAIL.COM | Phone: +91 8072528506</p>
          </div>
        </footer>

      </div>
      
      {role === "student" && !isCartDrawerOpen && currentView === "home" && (
        <div className="fixed bottom-10 right-10 z-[50]">
          {supportChatOpen && (
            <div className="absolute bottom-24 right-0 w-[400px] bg-white dark:bg-[#151515] shadow-[0_30px_60px_rgba(0,0,0,0.2)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.6)] rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 transition-all origin-bottom-right animate-fade-in">
              <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-gray-800 pb-6">
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-2xl">🎧</div>
                   <div className="flex flex-col"><h3 className="font-black text-xl text-gray-900 dark:text-white leading-tight">Support Chat</h3><span className="text-xs font-bold text-green-500 uppercase tracking-widest flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Online</span></div>
                 </div>
                 <button onClick={() => setSupportChatOpen(false)} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white font-bold transition-colors cursor-pointer">✕</button>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/10 p-5 rounded-2xl border border-blue-100 dark:border-blue-900/30 mb-6">
                <p className="text-sm font-bold text-blue-900 dark:text-blue-300 leading-relaxed">Hello there! Welcome to the official TAP 2 EAT support line. Do you have a question regarding a specific token number or refund? We typically reply in 2 minutes.</p>
              </div>
              <textarea placeholder="Type your specific issue here..." className="w-full bg-gray-50 dark:bg-[#202020] dark:text-white p-5 rounded-2xl outline-none text-sm font-bold mb-6 h-32 resize-none border border-gray-200 dark:border-gray-800 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all"></textarea>
              <button onClick={() => { alert("Support ticket dispatched!"); setSupportChatOpen(false); }} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl transition-colors shadow-[0_15px_30px_rgba(37,99,235,0.3)] text-lg">Dispatch Message</button>
            </div>
          )}
          <button onClick={() => setSupportChatOpen(!supportChatOpen)} className={`w-20 h-20 rounded-[2rem] shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex items-center justify-center text-4xl hover:scale-110 active:scale-95 transition-transform ${supportChatOpen ? 'bg-black text-white dark:bg-white dark:text-black rotate-12' : 'bg-blue-600 text-white'}`}>{supportChatOpen ? '✕' : '🎧'}</button>
        </div>
      )}
    </div>
  );
}