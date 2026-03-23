/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Home, 
  Headphones, 
  User, 
  Plus, 
  Minus, 
  Trash2, 
  Copy, 
  CheckCircle2, 
  ArrowRight,
  LogOut,
  CreditCard,
  ShieldCheck,
  Settings,
  Users,
  Package,
  Check,
  X,
  AlertCircle,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';

// --- Types ---
interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
  description: string;
  createdAt: any;
}

interface CartItem extends Omit<Product, 'id'> {
  id: string;
  quantity: number;
}

interface Order {
  id: string;
  userEmail: string;
  uid: string;
  items: CartItem[];
  total: number;
  date: any;
  status: 'confirmed' | 'pending' | 'cancelled';
  paymentMethod: string;
  transactionId: string;
  credentials?: { [productId: string]: string | { email?: string, pass?: string, key?: string } };
}

type View = 'login' | 'home' | 'cart' | 'payment' | 'support' | 'orders' | 'admin';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  blocked?: boolean;
  createdAt: any;
}

// --- App Component ---
export default function App() {
  const [view, setView] = useState<View>(() => {
    const saved = localStorage.getItem('nexus_view');
    return (saved as View) || 'home';
  });
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'bKash' | 'Nagad'>('bKash');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [manualCredentials, setManualCredentials] = useState<{ [orderId: string]: { email: string, pass: string, key: string } }>({});
  const [showNavbar, setShowNavbar] = useState(true);
  const lastScrollY = React.useRef(0);
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending'>('all');
  const [adminSubView, setAdminSubView] = useState<'dashboard' | 'users' | 'orders' | 'products' | 'support' | 'add-product' | 'edit-product' | 'payment-settings'>(() => {
    const saved = localStorage.getItem('nexus_admin_subview');
    return (saved as any) || 'dashboard';
  });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [paymentSettings, setPaymentSettings] = useState({ bKash: '01700-000000', Nagad: '01700-000000' });
  
  const [confirmingOrder, setConfirmingOrder] = useState<Order | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [confirmKey, setConfirmKey] = useState('');
  
  // Product Form State
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    category: 'VPN',
    image: '',
    description: ''
  });

  // --- Firebase Auth & Profile ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (!firebaseUser.email?.endsWith('@gmail.com')) {
          await signOut(auth);
          alert('Only @gmail.com addresses are allowed.');
          setLoading(false);
          return;
        }

        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;
          if (profile.blocked) {
            await signOut(auth);
            alert('Your account has been blocked. Please contact support.');
            setLoading(false);
            return;
          }
          setUser(profile);
        } else {
          const isDefaultAdmin = firebaseUser.email === 'robbanybagha805@gmail.com';
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || 'User',
            role: isDefaultAdmin ? 'admin' : 'user',
            blocked: false,
            createdAt: serverTimestamp()
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
          setUser(newProfile);
        }
      } else {
        setUser(null);
        setView('login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Real-time Data ---
  useEffect(() => {
    const qProducts = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'products'));

    const unsubPayments = onSnapshot(doc(db, 'config', 'payments'), (doc) => {
      if (doc.exists()) {
        setPaymentSettings(doc.data() as any);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'config/payments'));

    return () => {
      unsubProducts();
      unsubPayments();
    };
  }, []);

  // --- Real-time Data ---
  useEffect(() => {
    if (!user) return;

    // User's Orders
    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));

    // Admin Data
    let unsubAllOrders: () => void;
    let unsubAllUsers: () => void;
    let unsubSupport: () => void;

    if (user.role === 'admin') {
      const allOrdersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      unsubAllOrders = onSnapshot(allOrdersQuery, (snapshot) => {
        setAllOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
      });

      const allUsersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      unsubAllUsers = onSnapshot(allUsersQuery, (snapshot) => {
        setAllUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
      });

      const supportQuery = query(collection(db, 'support_messages'), orderBy('createdAt', 'desc'));
      unsubSupport = onSnapshot(supportQuery, (snapshot) => {
        setSupportMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    }

    return () => {
      unsubOrders();
      unsubAllOrders?.();
      unsubAllUsers?.();
      unsubSupport?.();
    };
  }, [user]);

  useEffect(() => {
    localStorage.setItem('nexus_view', view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem('nexus_admin_subview', adminSubView);
  }, [adminSubView]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const shouldShow = currentScrollY <= lastScrollY.current || currentScrollY <= 50;
      
      setShowNavbar(prev => {
        if (prev !== shouldShow) return shouldShow;
        return prev;
      });
      
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleGmailLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login failed. Please try again.');
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.endsWith('@gmail.com')) {
      alert('Only @gmail.com addresses are allowed.');
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Immediately update profile
      await updateProfile(userCredential.user, { displayName: name });
      
      // Manually create the user profile in Firestore to ensure 'name' is used
      const isDefaultAdmin = email === 'robbanybagha805@gmail.com';
      const newProfile: UserProfile = {
        uid: userCredential.user.uid,
        email: email,
        displayName: name || 'User',
        role: isDefaultAdmin ? 'admin' : 'user',
        blocked: false,
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', userCredential.user.uid), newProfile);
      setUser(newProfile);
      setView('home');
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setView('login');
  };

  // --- Logic ---
  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Components ---

  const LoginSignup = () => (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900 via-slate-950 to-black">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Nexus Digital</h1>
          <p className="text-blue-200/60">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</p>
        </div>
        
        <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailSignup} className="space-y-4 mb-6">
          {authMode === 'signup' && (
            <div>
              <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">Full Name</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="Your Name"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">Gmail Address</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              placeholder="example@gmail.com"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit"
            className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            {authMode === 'login' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-950 px-2 text-blue-200/20 font-bold">Or continue with</span></div>
        </div>

        <button 
          onClick={handleGmailLogin}
          className="w-full py-3 rounded-xl bg-white text-slate-900 font-bold flex items-center justify-center gap-3 hover:bg-slate-100 transition-all active:scale-95 shadow-xl"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          Google
        </button>

        <div className="mt-8 text-center">
          <p className="text-blue-200/40 text-sm">
            {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
              className="ml-2 text-blue-400 font-bold hover:underline"
            >
              {authMode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );

  const Homepage = () => (
    <div className="pb-24 pt-6 px-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Digital Catalog</h2>
          <p className="text-blue-200/50">Explore our premium digital assets</p>
        </div>
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-200/40 group-focus-within:text-blue-400 transition-colors" size={20} />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products..."
            className="w-full md:w-80 pl-12 pr-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filteredProducts.map((product) => (
          <motion.div 
            layout
            key={product.id}
            className="group rounded-2xl bg-white/5 border border-white/10 overflow-hidden hover:border-blue-500/50 transition-all duration-300"
          >
            <div className="relative h-32 sm:h-40 overflow-hidden">
              <img 
                src={product.image} 
                alt={product.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-blue-600/90 text-white text-[10px] font-bold backdrop-blur-md">
                {product.category}
              </div>
            </div>
            <div className="p-3">
              <h3 className="text-sm font-bold text-white mb-1 truncate">{product.name}</h3>
              <p className="text-blue-200/40 text-[10px] mb-3 line-clamp-1">{product.description}</p>
              <div className="flex items-center justify-between mb-4">
                <span className="text-lg font-bold text-blue-400">৳{product.price}</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => addToCart(product)}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-[10px] font-medium transition-all border border-white/5"
                >
                  <ShoppingCart size={14} />
                  Add
                </button>
                <button 
                  onClick={() => { addToCart(product); setView('cart'); }}
                  className="py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold transition-all shadow-lg shadow-blue-600/20"
                >
                  Order Now
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const CartPage = () => (
    <div className="pb-24 pt-6 px-4 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-white mb-8 tracking-tight flex items-center gap-3">
        <ShoppingCart className="text-blue-500" /> Your Cart
      </h2>
      
      {cart.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
          <ShoppingCart size={64} className="mx-auto text-blue-200/10 mb-4" />
          <p className="text-blue-200/40 text-lg">Your cart is empty</p>
          <button 
            onClick={() => setView('home')}
            className="mt-6 px-8 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all"
          >
            Start Shopping
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {cart.map((item) => (
            <div key={item.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
              <img src={item.image} alt={item.name} className="w-20 h-20 rounded-xl object-cover" referrerPolicy="no-referrer" />
              <div className="flex-1">
                <h4 className="text-white font-bold">{item.name}</h4>
                <p className="text-blue-400 font-bold">৳{item.price}</p>
              </div>
              <div className="flex items-center gap-3 bg-black/20 rounded-lg p-1">
                <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:text-blue-400 text-white/60"><Minus size={16} /></button>
                <span className="text-white font-medium w-6 text-center">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:text-blue-400 text-white/60"><Plus size={16} /></button>
              </div>
              <button onClick={() => removeFromCart(item.id)} className="p-2 text-red-400/60 hover:text-red-400 transition-colors">
                <Trash2 size={20} />
              </button>
            </div>
          ))}
          
          <div className="mt-8 p-6 rounded-3xl bg-blue-600/10 border border-blue-500/20">
            <div className="flex justify-between items-center mb-6">
              <span className="text-blue-200/60 font-medium">Total Amount</span>
              <span className="text-3xl font-bold text-white">৳{totalPrice}</span>
            </div>
            <button 
              onClick={() => setView('payment')}
              className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg transition-all flex items-center justify-center gap-2"
            >
              Proceed to Checkout <ArrowRight size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const PaymentPage = () => (
    <div className="pb-24 pt-6 px-4 max-w-xl mx-auto">
      <h2 className="text-3xl font-bold text-white mb-8 tracking-tight">Secure Payment</h2>
      
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => setPaymentMethod('bKash')}
            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${paymentMethod === 'bKash' ? 'bg-pink-600/20 border-pink-500 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}
          >
            <div className="w-12 h-12 bg-pink-600 rounded-full flex items-center justify-center font-bold text-white">b</div>
            bKash
          </button>
          <button 
            onClick={() => setPaymentMethod('Nagad')}
            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${paymentMethod === 'Nagad' ? 'bg-orange-600/20 border-orange-500 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}
          >
            <div className="w-12 h-12 bg-orange-600 rounded-full flex items-center justify-center font-bold text-white">N</div>
            Nagad
          </button>
        </div>

        <div className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-blue-200/60 text-sm">Send Money to:</span>
            <div className="flex items-center gap-2">
              <span className="text-white font-mono font-bold">{paymentMethod === 'bKash' ? paymentSettings.bKash : paymentSettings.Nagad}</span>
              <button 
                onClick={() => handleCopy(paymentMethod === 'bKash' ? paymentSettings.bKash : paymentSettings.Nagad)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-blue-400 transition-all"
              >
                {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-blue-200/60">Payable Amount:</span>
            <span className="text-blue-400 font-bold">৳{totalPrice}</span>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium text-blue-100">Transaction ID</label>
          <input 
            type="text"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="Enter your TrxID here"
            className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono uppercase"
          />
          <p className="text-xs text-blue-200/30">Please enter the Transaction ID you received after the payment.</p>
        </div>

        <button 
          disabled={!transactionId}
          onClick={async () => { 
            if (!user) return;
            
            const orderData = {
              userId: user.uid,
              userEmail: user.email,
              items: [...cart],
              total: totalPrice,
              paymentMethod: paymentMethod,
              transactionId: transactionId,
              status: 'pending',
              createdAt: serverTimestamp()
            };

            try {
              await addDoc(collection(db, 'orders'), orderData);
              alert('Order Placed Successfully! Please wait for admin confirmation.'); 
              setView('orders'); 
              setCart([]); 
              setTransactionId('');
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, 'orders');
            }
          }}
          className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg transition-all shadow-lg shadow-blue-600/20"
        >
          Verify & Complete Order
        </button>

        <div className="flex items-center justify-center gap-2 text-blue-200/40 text-sm">
          <ShieldCheck size={16} /> Secure 256-bit SSL Encrypted Payment
        </div>
      </div>
    </div>
  );

  const SupportPage = () => {
    const [msg, setMsg] = useState('');
    const [sending, setSending] = useState(false);

    const handleSend = async () => {
      if (!msg.trim()) return;
      setSending(true);
      try {
        await addDoc(collection(db, 'support_messages'), {
          userId: user?.uid,
          userEmail: user?.email,
          message: msg,
          status: 'unread',
          createdAt: serverTimestamp()
        });
        setMsg('');
        alert('Message sent! We will contact you soon.');
      } catch (err) {
        alert('Failed to send message.');
      } finally {
        setSending(false);
      }
    };

    return (
      <div className="pb-24 pt-6 px-4 max-w-xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-8 tracking-tight">Customer Support</h2>
        <div className="space-y-6">
          <div className="p-8 rounded-3xl bg-white/5 border border-white/10 text-center">
            <Headphones size={48} className="mx-auto text-blue-500 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">How can we help?</h3>
            <p className="text-blue-200/40 mb-6">Our team is available 24/7 to assist you with your digital purchases.</p>
            
            <div className="space-y-4 text-left">
              <textarea 
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Type your message here..."
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all h-32 resize-none"
              />
              <button 
                onClick={handleSend}
                disabled={sending}
                className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
          
          <div className="space-y-4">
            <h4 className="text-white font-bold">Common Questions</h4>
            {[
              "How long does delivery take?",
              "What if my code doesn't work?",
              "Can I get a refund?",
              "Which payment methods are accepted?"
            ].map((q, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/10 text-blue-200/60 text-sm cursor-pointer hover:bg-white/10 transition-all">
                {q}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const OrdersPage = () => (
    <div className="pb-24 pt-6 px-4 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-white mb-8 tracking-tight flex items-center gap-3">
        <CreditCard className="text-blue-500" /> Order History
      </h2>
      
      {orders.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
          <CreditCard size={64} className="mx-auto text-blue-200/10 mb-4" />
          <p className="text-blue-200/40 text-lg">No orders found</p>
          <button 
            onClick={() => setView('home')}
            className="mt-6 px-8 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all"
          >
            Browse Products
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div key={order.id} className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-blue-200/40 font-mono mb-1">{order.id}</p>
                  <p className="text-white font-bold">{order.date || (order.createdAt?.toDate().toLocaleString())}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  order.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' : 
                  order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {order.status}
                </span>
              </div>
              
              <div className="space-y-3 py-4 border-y border-white/5">
                {order.items.map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-200/60">{item.name} x{item.quantity}</span>
                      <span className="text-white font-medium">৳{item.price * item.quantity}</span>
                    </div>
                    {order.status === 'confirmed' && order.credentials && order.credentials[item.id] && (
                      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-3">
                        <p className="text-blue-400 font-bold mb-1 uppercase tracking-widest text-[9px]">Access Credentials</p>
                        {typeof order.credentials[item.id] === 'object' ? (
                          (() => {
                            const cred = order.credentials[item.id] as { email?: string, pass?: string, key?: string };
                            return (
                              <div className="grid grid-cols-1 gap-2">
                                {cred.email && (
                                  <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5 group">
                                    <div className="text-[10px]">
                                      <span className="text-blue-200/40 uppercase font-bold mr-2">Gmail:</span>
                                      <span className="text-white font-mono">{cred.email}</span>
                                    </div>
                                    <button onClick={() => handleCopy(cred.email!)} className="text-blue-400 hover:text-blue-300 transition-all"><Copy size={12}/></button>
                                  </div>
                                )}
                                {cred.pass && (
                                  <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5 group">
                                    <div className="text-[10px]">
                                      <span className="text-blue-200/40 uppercase font-bold mr-2">Pass:</span>
                                      <span className="text-white font-mono">{cred.pass}</span>
                                    </div>
                                    <button onClick={() => handleCopy(cred.pass!)} className="text-blue-400 hover:text-blue-300 transition-all"><Copy size={12}/></button>
                                  </div>
                                )}
                                {cred.key && (
                                  <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5 group">
                                    <div className="text-[10px]">
                                      <span className="text-blue-200/40 uppercase font-bold mr-2">Key:</span>
                                      <span className="text-white font-mono">{cred.key}</span>
                                    </div>
                                    <button onClick={() => handleCopy(cred.key!)} className="text-blue-400 hover:text-blue-300 transition-all"><Copy size={12}/></button>
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          <div className="flex items-center justify-between group">
                            <p className="text-white font-mono text-xs">{order.credentials[item.id]}</p>
                            <button onClick={() => handleCopy(order.credentials![item.id])} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-blue-400 transition-all">
                              <Copy size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between items-center pt-2">
                <div className="text-xs text-blue-200/30">
                  <p>Method: {order.paymentMethod}</p>
                  <p>TrxID: {order.transactionId}</p>
                </div>
                <p className="text-xl font-bold text-blue-400">৳{order.total}</p>
              </div>
              {order.status === 'pending' && (
                <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-200/60 text-center">
                  Waiting for admin to verify payment
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const AdminPanel = () => {
    const pendingOrdersCount = allOrders.filter(o => o.status === 'pending').length;

    const Dashboard = () => (
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <button 
            onClick={() => setAdminSubView('users')}
            className="p-6 rounded-3xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Users className="text-blue-500" />
            </div>
            <p className="text-blue-200/40 text-xs font-bold uppercase tracking-widest mb-1">Total Users</p>
            <p className="text-3xl font-bold text-white">{allUsers.length}</p>
          </button>

          <button 
            onClick={() => { setAdminSubView('orders'); setOrderFilter('all'); }}
            className="p-6 rounded-3xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Package className="text-purple-500" />
            </div>
            <p className="text-blue-200/40 text-xs font-bold uppercase tracking-widest mb-1">Total Orders</p>
            <p className="text-3xl font-bold text-white">{allOrders.length}</p>
          </button>

          <button 
            onClick={() => { setAdminSubView('orders'); setOrderFilter('pending'); }}
            className="p-6 rounded-3xl bg-yellow-500/5 border border-yellow-500/10 text-left hover:bg-yellow-500/10 transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <CreditCard className="text-yellow-500" />
            </div>
            <p className="text-yellow-500/40 text-xs font-bold uppercase tracking-widest mb-1">Pending Payments</p>
            <p className="text-3xl font-bold text-yellow-500">{pendingOrdersCount}</p>
          </button>

          <button 
            onClick={() => setAdminSubView('support')}
            className="p-6 rounded-3xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <MessageSquare className="text-emerald-500" />
            </div>
            <p className="text-blue-200/40 text-xs font-bold uppercase tracking-widest mb-1">Support Inbox</p>
            <p className="text-3xl font-bold text-white">{supportMessages.length}</p>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button 
            onClick={() => setAdminSubView('add-product')}
            className="p-8 rounded-3xl bg-blue-600 text-white flex items-center justify-between group hover:bg-blue-500 transition-all"
          >
            <div className="text-left">
              <h4 className="text-xl font-bold mb-1">Post New Product</h4>
              <p className="text-blue-100/60 text-sm">Add new VPN or digital service</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:rotate-90 transition-transform">
              <Plus size={24} />
            </div>
          </button>

          <button 
            onClick={() => setAdminSubView('products')}
            className="p-8 rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-between group hover:bg-white/10 transition-all"
          >
            <div className="text-left">
              <h4 className="text-xl font-bold mb-1">Manage Products</h4>
              <p className="text-blue-200/40 text-sm">Edit or delete existing products</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Settings size={24} />
            </div>
          </button>

          <button 
            onClick={() => setAdminSubView('payment-settings')}
            className="p-8 rounded-3xl bg-emerald-600 text-white flex items-center justify-between group hover:bg-emerald-500 transition-all"
          >
            <div className="text-left">
              <h4 className="text-xl font-bold mb-1">Payment Settings</h4>
              <p className="text-emerald-100/60 text-sm">Change bKash/Nagad numbers</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:rotate-90 transition-transform">
              <CreditCard size={24} />
            </div>
          </button>
        </div>
      </div>
    );

    const ProductFormView = ({ isEdit = false }: { isEdit?: boolean }) => (
      <div className="max-w-2xl mx-auto">
        <button 
          onClick={() => {
            setAdminSubView('dashboard');
            setEditingProduct(null);
            setNewProduct({ name: '', price: '', category: 'VPN', image: '', description: '' });
          }}
          className="mb-6 text-blue-400 flex items-center gap-2 hover:text-blue-300 transition-all"
        >
          <ArrowRight className="rotate-180" size={16} /> Back to Dashboard
        </button>
        <section className="bg-white/5 border border-white/10 rounded-3xl p-8">
          <h3 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
            {isEdit ? <Settings size={24} className="text-blue-400" /> : <Plus size={24} className="text-blue-400" />}
            {isEdit ? 'Edit Product' : 'Post New Product'}
          </h3>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">VPN Name</label>
                <input 
                  type="text"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="e.g. NordVPN Premium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">Price (BDT)</label>
                <input 
                  type="number"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="1200"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">Image URL</label>
              <input 
                type="text"
                value={newProduct.image}
                onChange={(e) => setNewProduct({...newProduct, image: e.target.value})}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">Description</label>
              <textarea 
                value={newProduct.description}
                onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all h-[120px] resize-none"
                placeholder="Describe the VPN features..."
              />
            </div>
            <button 
              onClick={async () => {
                if (!newProduct.name || !newProduct.price || !newProduct.image) {
                  alert('Please fill all required fields.');
                  return;
                }
                try {
                  if (isEdit && editingProduct) {
                    await updateDoc(doc(db, 'products', editingProduct.id!), {
                      ...newProduct,
                      price: Number(newProduct.price)
                    });
                    alert('Product Updated Successfully!');
                  } else {
                    await addDoc(collection(db, 'products'), {
                      ...newProduct,
                      price: Number(newProduct.price),
                      createdAt: serverTimestamp()
                    });
                    alert('Product Posted Successfully!');
                  }
                  setNewProduct({ name: '', price: '', category: 'VPN', image: '', description: '' });
                  setEditingProduct(null);
                  setAdminSubView('products');
                } catch (err) {
                  alert(`Failed to ${isEdit ? 'update' : 'post'} product.`);
                }
              }}
              className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
            >
              {isEdit ? 'Update Product' : 'Post Product'}
            </button>
          </div>
        </section>
      </div>
    );

    const UsersView = () => (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setAdminSubView('dashboard')}
            className="text-blue-400 flex items-center gap-2 hover:text-blue-300 transition-all"
          >
            <ArrowRight className="rotate-180" size={16} /> Back
          </button>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={20} className="text-blue-400" /> User Directory
          </h3>
        </div>
        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-blue-200/40 uppercase text-[10px] font-bold">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {allUsers.map((u) => (
                <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-white font-bold">{u.displayName}</p>
                    <p className="text-blue-200/40 text-xs">{u.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${u.blocked ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {u.blocked ? 'Blocked' : 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button 
                      onClick={() => {
                        setEditingUser(u);
                        setEditName(u.displayName);
                        setEditEmail(u.email);
                      }}
                      className="p-2 rounded-lg bg-white/5 text-white/40 hover:text-white transition-all"
                    >
                      <Settings size={14} />
                    </button>
                    <button 
                      onClick={async () => {
                        if (u.email === 'robbanybagha805@gmail.com') return;
                        try {
                          await updateDoc(doc(db, 'users', u.uid), { blocked: !u.blocked });
                        } catch (err) {
                          alert('Failed to update status.');
                        }
                      }}
                      className={`p-2 rounded-lg transition-all ${u.blocked ? 'bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20' : 'bg-red-600/10 text-red-400 hover:bg-red-600/20'}`}
                      title={u.blocked ? 'Unblock User' : 'Block User'}
                    >
                      {u.blocked ? <Check size={14} /> : <X size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

    const OrdersView = () => {
      const filteredOrders = orderFilter === 'all' ? allOrders : allOrders.filter(o => o.status === 'pending');
      
      return (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <button 
              onClick={() => setAdminSubView('dashboard')}
              className="text-blue-400 flex items-center gap-2 hover:text-blue-300 transition-all w-fit"
            >
              <ArrowRight className="rotate-180" size={16} /> Back
            </button>
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Package size={20} className="text-blue-400" /> Order Management
              </h3>
              <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                <button 
                  onClick={() => setOrderFilter('all')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${orderFilter === 'all' ? 'bg-blue-600 text-white' : 'text-blue-200/40 hover:text-white'}`}
                >
                  All
                </button>
                <button 
                  onClick={() => setOrderFilter('pending')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${orderFilter === 'pending' ? 'bg-blue-600 text-white' : 'text-blue-200/40 hover:text-white'}`}
                >
                  Pending ({pendingOrdersCount})
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <p className="text-blue-200/20 text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">No orders found</p>
            ) : (
              filteredOrders.map((order) => (
                <div key={order.id} className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-mono text-blue-200/40 mb-1">{order.id}</p>
                      <p className="text-white font-bold">{order.userEmail}</p>
                      <p className="text-[10px] text-blue-200/30">{order.createdAt?.toDate().toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${order.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' : order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {order.status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-blue-200/60">{item.name} x{item.quantity}</span>
                        <span className="text-white font-bold">৳{item.price * item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="text-[10px] text-blue-200/40 space-y-1">
                      <p>Method: <span className="text-white">{order.paymentMethod}</span></p>
                      <div className="flex items-center gap-2">
                        <p>TrxID: <span className="text-white font-mono select-all">{order.transactionId}</span></p>
                        <button 
                          onClick={() => handleCopy(order.transactionId)}
                          className="p-1 rounded bg-white/5 text-blue-400 hover:bg-white/10"
                        >
                          <Copy size={10} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {order.status === 'pending' && (
                        <>
                          <button 
                            onClick={() => {
                              setConfirmingOrder(order);
                              setConfirmEmail('');
                              setConfirmPass('');
                              setConfirmKey('');
                            }}
                            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition-all"
                          >
                            Confirm Payment
                          </button>
                          <button 
                            onClick={() => setCancellingOrder(order)}
                            className="px-4 py-2 rounded-xl bg-red-600/10 text-red-400 text-xs font-bold hover:bg-red-600/20 transition-all"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    };

    const ProductsView = () => (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setAdminSubView('dashboard')}
            className="text-blue-400 flex items-center gap-2 hover:text-blue-300 transition-all"
          >
            <ArrowRight className="rotate-180" size={16} /> Back
          </button>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Package size={20} className="text-blue-400" /> Manage Products
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p) => (
            <div key={p.id} className="p-6 rounded-3xl bg-white/5 border border-white/10 flex flex-col gap-4 group">
              <div className="relative aspect-video rounded-2xl overflow-hidden">
                <img src={p.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={p.name} referrerPolicy="no-referrer" />
                <div className="absolute top-3 right-3 flex gap-2">
                  <button 
                    onClick={() => {
                      setEditingProduct(p);
                      setNewProduct({
                        name: p.name,
                        price: p.price.toString(),
                        category: p.category || 'VPN',
                        image: p.image,
                        description: p.description || ''
                      });
                      setAdminSubView('edit-product');
                    }}
                    className="p-2 rounded-xl bg-blue-600 text-white shadow-lg hover:bg-blue-500 transition-all"
                  >
                    <Settings size={16} />
                  </button>
                  <button 
                    onClick={async () => {
                      if (confirm(`Delete ${p.name}?`)) {
                        try {
                          await deleteDoc(doc(db, 'products', p.id!));
                        } catch (err) {
                          alert('Failed to delete product.');
                        }
                      }
                    }}
                    className="p-2 rounded-xl bg-red-600 text-white shadow-lg hover:bg-red-500 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1">{p.name}</h4>
                <p className="text-blue-400 font-bold">৳{p.price}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );

    const SupportView = () => (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setAdminSubView('dashboard')}
            className="text-blue-400 flex items-center gap-2 hover:text-blue-300 transition-all"
          >
            <ArrowRight className="rotate-180" size={16} /> Back
          </button>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare size={20} className="text-blue-400" /> Support Inbox
          </h3>
        </div>
        <div className="space-y-4">
          {supportMessages.length === 0 ? (
            <p className="text-blue-200/20 text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">No messages yet</p>
          ) : (
            supportMessages.map((m) => (
              <div key={m.id} className="p-6 rounded-3xl bg-white/5 border border-white/10 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-bold">{m.userEmail}</p>
                    <p className="text-[10px] text-blue-200/40">{m.createdAt?.toDate().toLocaleString()}</p>
                  </div>
                  <button 
                    onClick={async () => {
                      if (confirm('Delete this message?')) {
                        try {
                          await deleteDoc(doc(db, 'support_messages', m.id));
                        } catch (err) {
                          alert('Failed to delete message.');
                        }
                      }
                    }}
                    className="p-2 rounded-lg bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p className="text-blue-200/60 text-sm bg-white/5 p-4 rounded-2xl border border-white/5 leading-relaxed">{m.message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    );

    const PaymentSettingsView = () => {
      const [bkashNum, setBkashNum] = useState(paymentSettings.bKash);
      const [nagadNum, setNagadNum] = useState(paymentSettings.Nagad);
      const [saving, setSaving] = useState(false);

      useEffect(() => {
        setBkashNum(paymentSettings.bKash);
        setNagadNum(paymentSettings.Nagad);
      }, [paymentSettings]);

      const handleSave = async () => {
        if (!bkashNum || !nagadNum) {
          alert('Both numbers are required!');
          return;
        }
        setSaving(true);
        try {
          console.log('Attempting to save payment settings:', { bKash: bkashNum, Nagad: nagadNum });
          const docRef = doc(db, 'config', 'payments');
          await setDoc(docRef, {
            bKash: bkashNum,
            Nagad: nagadNum
          }, { merge: true });
          
          console.log('Payment settings saved successfully');
          alert('Payment numbers updated successfully!');
          setAdminSubView('dashboard');
        } catch (err: any) {
          console.error('Failed to update payment numbers:', err);
          handleFirestoreError(err, OperationType.WRITE, 'config/payments');
          alert('Failed to update payment numbers: ' + (err.message || 'Unknown error'));
        } finally {
          setSaving(false);
        }
      };

      return (
        <div className="max-w-xl mx-auto space-y-6">
          <button 
            onClick={() => setAdminSubView('dashboard')}
            className="text-blue-400 flex items-center gap-2 hover:text-blue-300 transition-all"
          >
            <ArrowRight className="rotate-180" size={16} /> Back
          </button>
          <div className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
            <h3 className="text-2xl font-bold text-white flex items-center gap-3">
              <CreditCard className="text-blue-400" /> Payment Settings
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">bKash Number</label>
                <input 
                  type="text"
                  value={bkashNum}
                  onChange={(e) => setBkashNum(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">Nagad Number</label>
                <input 
                  type="text"
                  value={nagadNum}
                  onChange={(e) => setNagadNum(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="pb-24 pt-6 px-4 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <ShieldCheck className="text-blue-500" /> Admin Panel
          </h2>
          {adminSubView !== 'dashboard' && (
            <button 
              onClick={() => setAdminSubView('dashboard')}
              className="px-4 py-2 rounded-xl bg-white/5 text-white text-xs font-bold border border-white/10 hover:bg-white/10 transition-all"
            >
              Dashboard
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={adminSubView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {adminSubView === 'dashboard' && <Dashboard />}
            {adminSubView === 'users' && <UsersView />}
            {adminSubView === 'orders' && <OrdersView />}
            {adminSubView === 'products' && <ProductsView />}
            {adminSubView === 'support' && <SupportView />}
            {adminSubView === 'add-product' && <ProductFormView />}
            {adminSubView === 'edit-product' && <ProductFormView isEdit />}
            {adminSubView === 'payment-settings' && <PaymentSettingsView />}
          </motion.div>
        </AnimatePresence>

        {/* User Edit Modal */}
        <AnimatePresence>
          {editingUser && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md p-8 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl"
              >
                <h3 className="text-2xl font-bold text-white mb-6">Edit User Profile</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">Display Name</label>
                    <input 
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">Email Address</label>
                    <input 
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-blue-200/40 uppercase tracking-widest mb-2">Role</label>
                    <select 
                      value={editingUser.role}
                      onChange={async (e) => {
                        if (!editingUser) return;
                        const newRole = e.target.value as 'admin' | 'user';
                        try {
                          await updateDoc(doc(db, 'users', editingUser.uid), { role: newRole });
                          setEditingUser({ ...editingUser, role: newRole });
                        } catch (err) {
                          alert('Failed to update role.');
                        }
                      }}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    >
                      <option value="user" className="bg-slate-900">User</option>
                      <option value="admin" className="bg-slate-900">Admin</option>
                    </select>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => setEditingUser(null)}
                      className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={async () => {
                        if (!editingUser) return;
                        try {
                          await updateDoc(doc(db, 'users', editingUser.uid), {
                            displayName: editName,
                            email: editEmail
                          });
                          setEditingUser(null);
                          alert('User updated successfully!');
                        } catch (err) {
                          alert('Failed to update user.');
                        }
                      }}
                      className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) return <LoginSignup />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-bottom border-white/5 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <ShieldCheck className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tighter text-white">NEXUS</span>
          </div>
          <div className="flex items-center gap-4">
            {user.role === 'admin' && (
              <button 
                onClick={() => setView('admin')}
                className={`p-2 rounded-xl transition-all ${view === 'admin' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/40 hover:text-white'}`}
              >
                <Settings size={20} />
              </button>
            )}
            <button 
              onClick={handleLogout}
              className="p-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-all"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Cancel Order Modal */}
      <AnimatePresence>
        {cancellingOrder && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Cancel Order</h3>
                <button onClick={() => setCancellingOrder(null)} className="text-blue-200/40 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-blue-200/60">Are you sure you want to cancel the order for <span className="text-white font-bold">{cancellingOrder.userEmail}</span>?</p>
                <p className="text-xs text-red-400/60 bg-red-400/5 p-3 rounded-xl border border-red-400/10">This action will mark the order as cancelled and it cannot be undone.</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setCancellingOrder(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all"
                >
                  No, Keep it
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'orders', cancellingOrder.id), { 
                        status: 'cancelled' 
                      });
                      alert('Order Cancelled Successfully!');
                      setCancellingOrder(null);
                    } catch (err: any) {
                      console.error('Cancel error:', err);
                      handleFirestoreError(err, OperationType.UPDATE, `orders/${cancellingOrder.id}`);
                      alert('Failed to cancel order: ' + (err.message || 'Unknown error'));
                    }
                  }}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-600/20 active:scale-95"
                >
                  Yes, Cancel Order
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Order Modal */}
      <AnimatePresence>
        {confirmingOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Confirm Order</h3>
                <button onClick={() => setConfirmingOrder(null)} className="text-blue-200/40 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-blue-200/60">Enter VPN credentials for: <span className="text-white font-bold">{confirmingOrder.userEmail}</span></p>
                
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] font-bold text-blue-200/40 uppercase tracking-widest mb-2">Order Items</p>
                  <div className="space-y-1">
                    {confirmingOrder.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-white/80">{item.name} x{item.quantity}</span>
                        <span className="text-blue-400 font-bold">৳{item.price * item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-200/40 uppercase tracking-widest">VPN Email</label>
                  <input 
                    type="text"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="example@vpn.com"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-200/40 uppercase tracking-widest">VPN Password</label>
                  <input 
                    type="text"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-200/40 uppercase tracking-widest">VPN Key (Optional)</label>
                  <input 
                    type="text"
                    value={confirmKey}
                    onChange={(e) => setConfirmKey(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="Activation Key"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setConfirmingOrder(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    if (!confirmEmail || !confirmPass) {
                      alert('Email and Password are required!');
                      return;
                    }
                    
                    const credentials: { [key: string]: any } = {};
                    confirmingOrder.items.forEach(item => {
                      credentials[item.id] = { email: confirmEmail, pass: confirmPass, key: confirmKey };
                    });

                    try {
                      await updateDoc(doc(db, 'orders', confirmingOrder.id), { 
                        status: 'confirmed',
                        credentials 
                      });
                      alert('Order Confirmed Successfully!');
                      setConfirmingOrder(null);
                    } catch (err: any) {
                      console.error('Confirm error:', err);
                      handleFirestoreError(err, OperationType.UPDATE, `orders/${confirmingOrder.id}`);
                      alert('Failed to confirm order: ' + (err.message || 'Unknown error'));
                    }
                  }}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'home' && <Homepage />}
            {view === 'cart' && <CartPage />}
            {view === 'payment' && <PaymentPage />}
            {view === 'support' && <SupportPage />}
            {view === 'orders' && <OrdersPage />}
            {view === 'admin' && user.role === 'admin' && <AdminPanel />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <AnimatePresence>
        {view === 'home' && showNavbar && (
          <motion.nav 
            initial={{ y: 100, x: '-50%', opacity: 0 }}
            animate={{ y: 0, x: '-50%', opacity: 1 }}
            exit={{ y: 100, x: '-50%', opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="fixed bottom-4 left-1/2 w-[85%] max-w-xs z-50"
          >
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-1.5 shadow-2xl flex items-center justify-around">
              <NavButton 
                active={view === 'home'} 
                onClick={() => setView('home')} 
                icon={<Home size={20} />} 
                label="Home" 
              />
              <NavButton 
                active={view === 'cart'} 
                onClick={() => setView('cart')} 
                icon={
                  <div className="relative">
                    <ShoppingCart size={20} />
                    {cart.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center border border-slate-900">
                        {cart.length}
                      </span>
                    )}
                  </div>
                } 
                label="Cart" 
              />
              <NavButton 
                active={view === 'support'} 
                onClick={() => setView('support')} 
                icon={<Headphones size={20} />} 
                label="Support" 
              />
              <NavButton 
                active={view === 'orders'} 
                onClick={() => setView('orders')} 
                icon={<User size={20} />} 
                label="Orders" 
              />
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-white/5 py-12 px-4 pb-32">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                <ShieldCheck className="text-white" size={18} />
              </div>
              <span className="text-lg font-bold tracking-tighter text-white">NEXUS</span>
            </div>
            <p className="text-blue-200/40 text-sm max-w-xs text-center md:text-left leading-relaxed">
              Premium VPN solutions for secure and unrestricted internet access. Your privacy is our priority.
            </p>
          </div>
          <div className="flex flex-col items-center md:items-end gap-3 text-center md:text-right">
            <p className="text-white/60 text-sm font-medium">
              © 2026 NEXUS VPN. All rights reserved.
            </p>
            <div className="flex flex-col gap-1">
              <p className="text-blue-400 text-[11px] font-bold uppercase tracking-[0.2em]">
                @ NEXUS PREMIUM SERVICES
              </p>
              <p className="text-blue-200/20 text-[10px] font-mono uppercase tracking-widest">
                Trusted by thousands of users worldwide
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-300 ${active ? 'text-blue-400 bg-blue-400/10' : 'text-white/40 hover:text-white/60 hover:bg-white/5'}`}
    >
      {icon}
      <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}
