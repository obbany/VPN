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
  MessageSquare,
  Database,
  Bookmark,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, googleProvider, handleFirestoreError, OperationType, sendEmailVerification } from './firebase';
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
  getDocs,
  writeBatch
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
  createdAt?: any;
  status: 'confirmed' | 'pending' | 'cancelled' | 'out_of_stock';
  paymentMethod: string;
  transactionId: string;
  pinned?: boolean;
  expiryDate?: string;
  credentials?: { [productId: string]: string | { email?: string, pass?: string, key?: string } | any[] };
}

type View = 'login' | 'home' | 'payment' | 'support' | 'orders' | 'admin';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  blocked?: boolean;
  createdAt: any;
}

interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  email: string;
  password?: string;
  key?: string;
  isUsed: boolean;
  expiryDays?: number;
  assignedToOrderId?: string;
  createdAt: any;
}

// --- App Component ---
export default function App() {
  const [view, setView] = useState<View>(() => {
    const saved = localStorage.getItem('nexus_view');
    return (saved as View) || 'home';
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const pendingOrdersCount = useMemo(() => allOrders.filter(o => o.status === 'pending').length, [allOrders]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
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
  const [adminSubView, setAdminSubView] = useState<'dashboard' | 'users' | 'orders' | 'products' | 'support' | 'add-product' | 'edit-product' | 'payment-settings' | 'inventory'>(() => {
    const saved = localStorage.getItem('nexus_admin_subview');
    return (saved as any) || 'dashboard';
  });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [paymentSettings, setPaymentSettings] = useState({ bKash: '01700-000000', Nagad: '01700-000000' });
  
  // Inventory State
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryFilterProductId, setInventoryFilterProductId] = useState<string>('all');
  const [newInventoryProductId, setNewInventoryProductId] = useState<string>('');
  const [newInventoryEmail, setNewInventoryEmail] = useState('');
  const [newInventoryPass, setNewInventoryPass] = useState('');
  const [newInventoryKey, setNewInventoryKey] = useState('');
  const [newInventoryExpiryDays, setNewInventoryExpiryDays] = useState('30');
  const [deletingInventoryId, setDeletingInventoryId] = useState<string | null>(null);

  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [stockOutOrder, setStockOutOrder] = useState<Order | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Product Form State
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    category: 'VPN',
    image: '',
    description: ''
  });

  // Support Page State
  const [supportMsg, setSupportMsg] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Payment Settings State
  const [bkashNum, setBkashNum] = useState('');
  const [nagadNum, setNagadNum] = useState('');
  const [savingPaymentSettings, setSavingPaymentSettings] = useState(false);

  // Helper for toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    setBkashNum(paymentSettings.bKash);
    setNagadNum(paymentSettings.Nagad);
  }, [paymentSettings]);

  // --- Firebase Auth & Profile ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;
          if (profile.blocked) {
            await signOut(auth);
            showToast('Your account has been blocked. Please contact support.');
            setLoading(false);
            return;
          }
          // Force admin role for default admins if not already set
          const isDefaultAdmin = firebaseUser.email === 'robbanybagha805@gmail.com' || firebaseUser.email === 'brothersonfire208@gmail.com';
          if (isDefaultAdmin && profile.role !== 'admin') {
            profile.role = 'admin';
            await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' });
          }
          setUser(profile);
          setView(prev => prev === 'login' ? 'home' : prev);
        } else {
          const isDefaultAdmin = firebaseUser.email === 'robbanybagha805@gmail.com' || firebaseUser.email === 'brothersonfire208@gmail.com';
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'User',
            role: isDefaultAdmin ? 'admin' : 'user',
            blocked: false,
            createdAt: serverTimestamp()
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
          setUser(newProfile);
          setView(prev => prev === 'login' ? 'home' : prev);
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

    return () => unsubProducts();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubPayments = onSnapshot(doc(db, 'config', 'payments'), (doc) => {
      if (doc.exists()) {
        setPaymentSettings(doc.data() as any);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'config/payments'));

    return () => unsubPayments();
  }, [user]);

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
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'orders');
      showToast('Failed to load orders.');
    });

    // Admin Data
    let unsubAllOrders: () => void;
    let unsubAllUsers: () => void;
    let unsubSupport: () => void;
    let unsubInventory: () => void;

    if (user.role === 'admin') {
      const allOrdersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      unsubAllOrders = onSnapshot(allOrdersQuery, (snapshot) => {
        setAllOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'orders');
      });

      const allUsersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      unsubAllUsers = onSnapshot(allUsersQuery, (snapshot) => {
        setAllUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
      });

      const supportQuery = query(collection(db, 'support_messages'), orderBy('createdAt', 'desc'));
      unsubSupport = onSnapshot(supportQuery, (snapshot) => {
        setSupportMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'support_messages');
      });

      const inventoryQuery = query(collection(db, 'inventory'), orderBy('createdAt', 'desc'));
      unsubInventory = onSnapshot(inventoryQuery, (snapshot) => {
        setInventoryItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'inventory');
      });
    } else {
      const supportQuery = query(collection(db, 'support_messages'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
      unsubSupport = onSnapshot(supportQuery, (snapshot) => {
        setSupportMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'support_messages');
      });
    }

    return () => {
      unsubOrders();
      unsubAllOrders?.();
      unsubAllUsers?.();
      unsubSupport?.();
      unsubInventory?.();
    };
  }, [user]);

  useEffect(() => {
    localStorage.setItem('nexus_view', view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  useEffect(() => {
    localStorage.setItem('nexus_admin_subview', adminSubView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [adminSubView]);

  // Cleanup expired orders
  useEffect(() => {
    if (!user || user.role !== 'admin' || allOrders.length === 0) return;

    const cleanupExpiredOrders = async () => {
      const now = new Date();
      const expiredOrders = allOrders.filter(o => {
        if (!o.expiryDate) return false;
        return new Date(o.expiryDate) < now;
      });

      if (expiredOrders.length > 0) {
        const batch = writeBatch(db);
        expiredOrders.forEach(o => {
          batch.delete(doc(db, 'orders', o.id));
        });
        try {
          await batch.commit();
        } catch (err) {
          console.error('Failed to cleanup expired orders:', err);
        }
      }
    };

    cleanupExpiredOrders();
  }, [user, allOrders.length]);

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
      setView('home');
    } catch (error) {
      console.error('Login failed:', error);
      showToast('Login failed. Please try again.');
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

  const totalPrice = selectedProduct?.price || 0;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Components ---

  const handleConfirmOrder = async (order: Order) => {
    try {
      const credentials: { [key: string]: any } = {};
      const updates: Promise<void>[] = [];
      const inventoryUpdates: { id: string, data: any }[] = [];
      let maxExpiryDays = 30;

      for (const item of order.items) {
        // Find available inventory for this product
        const availableItems = inventoryItems.filter(inv => inv.productId === item.id && !inv.isUsed);
        
        if (availableItems.length < item.quantity) {
          showToast(`Not enough stock for ${item.name}. Please add more to inventory.`);
          return;
        }

        // Assign the required quantity
        const itemCredentials = [];
        for (let i = 0; i < item.quantity; i++) {
          const invItem = availableItems[i];
          if (invItem.expiryDays && invItem.expiryDays > 0) {
            maxExpiryDays = Math.max(maxExpiryDays, invItem.expiryDays);
          }
          itemCredentials.push({ email: invItem.email, pass: invItem.password, key: invItem.key });
          inventoryUpdates.push({
            id: invItem.id,
            data: { isUsed: true, assignedToOrderId: order.id }
          });
        }
        credentials[item.id] = itemCredentials;
      }

      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + maxExpiryDays);

      // Update inventory items
      for (const update of inventoryUpdates) {
        updates.push(updateDoc(doc(db, 'inventory', update.id), update.data));
      }

      // Update order
      updates.push(updateDoc(doc(db, 'orders', order.id), {
        status: 'confirmed',
        credentials,
        expiryDate: expiryDate.toISOString()
      }));

      await Promise.all(updates);
      showToast('Order confirmed and credentials assigned successfully!');
    } catch (err: any) {
      console.error('Confirm error:', err);
      showToast('Failed to confirm order: ' + (err.message || 'Unknown error'));
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => setAdminSubView('users')}
          className="p-4 rounded-3xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-all group"
        >
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Users className="text-blue-500" size={20} />
          </div>
          <p className="text-blue-200/40 text-[10px] font-bold uppercase tracking-widest mb-1">Total Users</p>
          <p className="text-2xl font-bold text-white">{allUsers.length}</p>
        </button>

        <button 
          onClick={() => { setAdminSubView('orders'); setOrderFilter('all'); }}
          className="p-4 rounded-3xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-all group"
        >
          <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Package className="text-purple-500" size={20} />
          </div>
          <p className="text-blue-200/40 text-[10px] font-bold uppercase tracking-widest mb-1">Total Orders</p>
          <p className="text-2xl font-bold text-white">{allOrders.length}</p>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => { setAdminSubView('orders'); setOrderFilter('pending'); }}
          className="p-4 rounded-3xl bg-yellow-500/5 border border-yellow-500/10 text-left hover:bg-yellow-500/10 transition-all group"
        >
          <div className="w-10 h-10 rounded-2xl bg-yellow-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <CreditCard className="text-yellow-500" size={20} />
          </div>
          <p className="text-yellow-500/40 text-[10px] font-bold uppercase tracking-widest mb-1">Pending Payments</p>
          <p className="text-2xl font-bold text-yellow-500">{pendingOrdersCount}</p>
        </button>

        <button 
          onClick={() => setAdminSubView('support')}
          className="p-4 rounded-3xl bg-white/5 border border-white/10 text-left hover:bg-white/10 transition-all group"
        >
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <MessageSquare className="text-emerald-500" size={20} />
          </div>
          <p className="text-blue-200/40 text-[10px] font-bold uppercase tracking-widest mb-1">Support Inbox</p>
          <p className="text-2xl font-bold text-white">{supportMessages.length}</p>
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

        <button 
          onClick={() => setAdminSubView('inventory')}
          className="p-8 rounded-3xl bg-purple-600 text-white flex items-center justify-between group hover:bg-purple-500 transition-all"
        >
          <div className="text-left">
            <h4 className="text-xl font-bold mb-1">Inventory</h4>
            <p className="text-purple-100/60 text-sm">Manage VPN credentials</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Database size={24} />
          </div>
        </button>
      </div>
    </div>
  );

  const renderProductFormView = ({ isEdit = false }: { isEdit?: boolean }) => (
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
                showToast('Please fill all required fields.');
                return;
              }
              try {
                if (isEdit && editingProduct) {
                  await updateDoc(doc(db, 'products', editingProduct.id!), {
                    ...newProduct,
                    price: Number(newProduct.price)
                  });
                  showToast('Product Updated Successfully!');
                } else {
                  await addDoc(collection(db, 'products'), {
                    ...newProduct,
                    price: Number(newProduct.price),
                    createdAt: serverTimestamp()
                  });
                  showToast('Product Posted Successfully!');
                }
                setNewProduct({ name: '', price: '', category: 'VPN', image: '', description: '' });
                setEditingProduct(null);
                setAdminSubView('products');
              } catch (err) {
                showToast(`Failed to ${isEdit ? 'update' : 'post'} product.`);
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

  const renderUsersView = () => {
    const filteredUsers = allUsers.filter(u => 
      u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      u.displayName.toLowerCase().includes(userSearchQuery.toLowerCase())
    );

    return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button 
          onClick={() => setAdminSubView('dashboard')}
          className="text-blue-400 flex items-center gap-2 hover:text-blue-300 transition-all w-fit"
        >
          <ArrowRight className="rotate-180" size={16} /> Back
        </button>
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative group w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-200/40 group-focus-within:text-blue-400 transition-colors" size={16} />
            <input 
              type="text"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              placeholder="Search by email or name..."
              className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={20} className="text-blue-400" /> User Directory
          </h3>
        </div>
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
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-20 text-center text-blue-200/20">
                  No users found matching your search
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
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
                        if (u.email === 'robbanybagha805@gmail.com' || u.email === 'brothersonfire208@gmail.com') return;
                        try {
                          await updateDoc(doc(db, 'users', u.uid), { blocked: !u.blocked });
                          showToast('User status updated!');
                        } catch (err) {
                          showToast('Failed to update status.');
                        }
                      }}
                      className={`p-2 rounded-lg transition-all ${u.blocked ? 'bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20' : 'bg-red-600/10 text-red-400 hover:bg-red-600/20'}`}
                      title={u.blocked ? 'Unblock User' : 'Block User'}
                    >
                      {u.blocked ? <Check size={14} /> : <X size={14} />}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
  };

  const renderOrdersView = () => {
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
                    {order.expiryDate && (
                      <p className="text-[10px] text-red-400 font-bold mt-1">
                        Expires: {new Date(order.expiryDate).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                      order.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' : 
                      order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' : 
                      order.status === 'out_of_stock' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {order.status === 'out_of_stock' ? 'Out of Stock' : order.status}
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
                          onClick={() => handleConfirmOrder(order)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition-all"
                        >
                          Confirm Payment
                        </button>
                        <button 
                          onClick={() => setStockOutOrder(order)}
                          className="px-4 py-2 rounded-xl bg-orange-600/10 text-orange-400 text-xs font-bold hover:bg-orange-600/20 transition-all"
                        >
                          Stock Out
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

  const renderProductsView = () => (
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
                  onClick={() => setDeletingProduct(p)}
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

  const renderSupportView = () => {
    console.log('supportMessages:', supportMessages);
    return (
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
        {supportMessages.length > 0 && (
          <button 
            onClick={async () => {
              if (window.confirm('Are you sure you want to delete all messages?')) {
                try {
                  const batch = writeBatch(db);
                  supportMessages.forEach((m) => {
                    batch.delete(doc(db, 'support_messages', m.id));
                  });
                  await batch.commit();
                  showToast('All messages deleted successfully!');
                } catch (err) {
                  showToast('Failed to delete all messages.');
                }
              }
            }}
            className="px-4 py-2 rounded-lg bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-all text-xs font-bold flex items-center gap-2"
          >
            <Trash2 size={14} /> Delete All
          </button>
        )}
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
                  onClick={() => setDeletingMessage(m)}
                  className="p-2 rounded-lg bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="text-blue-200/60 text-sm bg-white/5 p-4 rounded-2xl border border-white/5 leading-relaxed">{m.message}</p>
              {m.reply ? (
                <div className="p-4 rounded-2xl bg-blue-600/10 border border-blue-500/20">
                  <p className="text-xs font-bold text-blue-400 mb-1">Your Reply:</p>
                  <p className="text-blue-100/80 text-sm">{m.reply}</p>
                </div>
              ) : (
                <div className="mt-4">
                  {replyingTo === m.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type your reply..."
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all h-24 resize-none text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!replyText.trim()) return;
                            try {
                              await updateDoc(doc(db, 'support_messages', m.id), {
                                reply: replyText,
                                status: 'read',
                                repliedAt: serverTimestamp()
                              });
                              setReplyingTo(null);
                              setReplyText('');
                              showToast('Reply sent successfully!');
                            } catch (err) {
                              showToast('Failed to send reply.');
                            }
                          }}
                          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all"
                        >
                          Send Reply
                        </button>
                        <button
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyText('');
                          }}
                          className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-bold transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setReplyingTo(m.id);
                        setReplyText('');
                      }}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-2"
                    >
                      <MessageSquare size={14} /> Reply
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
  };

  const renderPaymentSettingsView = () => {
    const handleSave = async () => {
      if (!bkashNum || !nagadNum) {
        showToast('Both numbers are required!');
        return;
      }
      setSavingPaymentSettings(true);
      try {
        console.log('Attempting to save payment settings:', { bKash: bkashNum, Nagad: nagadNum });
        const docRef = doc(db, 'config', 'payments');
        await setDoc(docRef, {
          bKash: bkashNum,
          Nagad: nagadNum
        }, { merge: true });
        
        console.log('Payment settings saved successfully');
        showToast('Payment numbers updated successfully!');
        setAdminSubView('dashboard');
      } catch (err: any) {
        console.error('Failed to update payment numbers:', err);
        handleFirestoreError(err, OperationType.WRITE, 'config/payments');
        showToast('Failed to update payment numbers: ' + (err.message || 'Unknown error'));
      } finally {
        setSavingPaymentSettings(false);
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
              disabled={savingPaymentSettings}
              className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all disabled:opacity-50"
            >
              {savingPaymentSettings ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAuthView = () => (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900 via-slate-950 to-black">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Nexus Digital</h1>
          <p className="text-blue-200/60">Sign in to continue</p>
        </div>
        
        <button 
          onClick={handleGmailLogin}
          className="w-full py-3 rounded-xl bg-white text-slate-900 font-bold flex items-center justify-center gap-3 hover:bg-slate-100 transition-all active:scale-95 shadow-xl"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          Continue with Google
        </button>
      </motion.div>
    </div>
  );

  const renderHomepage = () => (
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
                  onClick={() => { setSelectedProduct(product); setView('payment'); }}
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

  const renderPaymentPage = () => {
    if (!selectedProduct) {
      return (
        <div className="pb-24 pt-6 px-4 max-w-xl mx-auto text-center">
          <p className="text-blue-200/40 text-lg mb-4">No product selected.</p>
          <button 
            onClick={() => setView('home')}
            className="px-8 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all"
          >
            Go Back
          </button>
        </div>
      );
    }

    return (
      <div className="pb-24 pt-6 px-4 max-w-xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setView('home')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all">
            <ArrowRight className="rotate-180" size={20} />
          </button>
          <h2 className="text-3xl font-bold text-white tracking-tight">Secure Payment</h2>
        </div>
        
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4">
            <img src={selectedProduct.image} alt={selectedProduct.name} className="w-16 h-16 rounded-xl object-cover" referrerPolicy="no-referrer" />
            <div>
              <h4 className="text-white font-bold">{selectedProduct.name}</h4>
              <p className="text-blue-400 font-bold">৳{selectedProduct.price}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => setPaymentMethod('bKash')}
            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${paymentMethod === 'bKash' ? 'bg-pink-600/20 border-pink-500 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}
          >
            <img src="https://i.ibb.co/q3YTcmPs/332c2060c5.jpg" alt="bKash" className="w-16 h-16 rounded-full object-cover" referrerPolicy="no-referrer" />
            bKash
          </button>
          <button 
            onClick={() => setPaymentMethod('Nagad')}
            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${paymentMethod === 'Nagad' ? 'bg-orange-600/20 border-orange-500 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}
          >
            <img src="https://i.ibb.co/Zzjzc6J8/f50dbb811b.jpg" alt="Nagad" className="w-16 h-16 rounded-full object-cover" referrerPolicy="no-referrer" />
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
              items: [{ ...selectedProduct, quantity: 1 }],
              total: totalPrice,
              paymentMethod: paymentMethod,
              transactionId: transactionId,
              status: 'pending',
              createdAt: serverTimestamp()
            };

            try {
              await addDoc(collection(db, 'orders'), orderData);
              showToast('Order Placed Successfully! Please wait for admin confirmation.'); 
              setView('orders'); 
              setSelectedProduct(null); 
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
  };

  const renderSupportPage = () => {
    const handleSend = async () => {
      if (!supportMsg.trim()) return;
      setSupportSending(true);
      try {
        await addDoc(collection(db, 'support_messages'), {
          userId: user?.uid,
          userEmail: user?.email,
          message: supportMsg,
          status: 'unread',
          createdAt: serverTimestamp()
        });
        setSupportMsg('');
        showToast('Message sent! We will contact you soon.');
      } catch (err) {
        showToast('Failed to send message.');
      } finally {
        setSupportSending(false);
      }
    };

    return (
      <div className="pb-24 pt-6 px-4 max-w-xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setView('home')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all">
            <ArrowRight className="rotate-180" size={20} />
          </button>
          <h2 className="text-3xl font-bold text-white tracking-tight">Customer Support</h2>
        </div>
        <div className="space-y-6">
          <div className="p-8 rounded-3xl bg-white/5 border border-white/10 text-center">
            <Headphones size={48} className="mx-auto text-blue-500 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">How can we help?</h3>
            <p className="text-blue-200/40 mb-6">Our team is available 24/7 to assist you with your digital purchases.</p>
            
            <div className="space-y-4 text-left">
              <textarea 
                value={supportMsg}
                onChange={(e) => setSupportMsg(e.target.value)}
                placeholder="Type your message here..."
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all h-32 resize-none"
              />
              <button 
                onClick={handleSend}
                disabled={supportSending}
                className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {supportSending ? 'Sending...' : 'Send Message'}
              </button>

              <div className="mt-8">
                <h3 className="text-xl font-bold text-white mb-4">Your Messages</h3>
                <div className="space-y-4">
                  {supportMessages.map((m) => (
                    <div key={m.id} className="p-4 rounded-2xl bg-white/5 border border-white/10">
                      <p className="text-white text-sm">{m.message}</p>
                      {m.reply && (
                        <p className="text-emerald-400 text-sm mt-2">Reply: {m.reply}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/5"></span>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-900 px-2 text-blue-200/20 font-bold tracking-widest">OR</span>
                </div>
              </div>

              <a 
                href="https://t.me/nexus_vpn_services" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full py-4 rounded-xl bg-[#24A1DE]/10 border border-[#24A1DE]/20 text-[#24A1DE] font-bold transition-all flex items-center justify-center gap-3 hover:bg-[#24A1DE] hover:text-white shadow-lg shadow-[#24A1DE]/10"
              >
                <Send size={20} />
                Join Our Telegram Channel
              </a>
            </div>
          </div>

          {supportMessages.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-white font-bold">Your Messages</h4>
              <div className="space-y-4">
                {supportMessages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.reply ? 'items-start' : 'items-end'}`}>
                    {/* User Message */}
                    <div className="flex items-start gap-2 max-w-[85%]">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {msg.userEmail?.charAt(0).toUpperCase()}
                      </div>
                      <div className="p-3 rounded-2xl bg-white/10 border border-white/5 text-white text-sm">
                        {msg.message}
                      </div>
                    </div>
                    
                    {/* Admin Reply */}
                    {msg.reply && (
                      <div className="flex items-start gap-2 max-w-[85%] mt-2 ml-10">
                        <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          A
                        </div>
                        <div className="p-3 rounded-2xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-100 text-sm">
                          {msg.reply}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
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

  const handlePinOrder = async (orderId: string, currentPinned: boolean) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { pinned: !currentPinned });
      showToast(currentPinned ? 'Order unpinned' : 'Order pinned');
    } catch (err: any) {
      console.error('Pin error:', err);
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      showToast('Failed to update pin status');
    }
  };

  const renderOrdersPage = () => {
    const activeOrders = orders.filter(o => {
      if (!o.expiryDate) return true;
      const expiry = new Date(o.expiryDate);
      return expiry > new Date();
    });

    const pinnedOrders = activeOrders.filter(o => o.pinned);
    const unpinnedOrders = activeOrders.filter(o => !o.pinned);

    const renderOrderCard = (order: Order) => (
      <div key={order.id} className={`p-6 rounded-3xl bg-white/5 border ${order.pinned ? 'border-blue-500/30' : 'border-white/10'} space-y-4 relative group`}>
        <button 
          onClick={() => handlePinOrder(order.id, !!order.pinned)}
          className={`absolute top-6 right-6 p-2 rounded-xl transition-all ${order.pinned ? 'bg-blue-600 text-white' : 'bg-white/5 text-blue-200/40 hover:text-white'}`}
          title={order.pinned ? 'Unpin Order' : 'Pin Order'}
        >
          <Bookmark size={16} fill={order.pinned ? 'currentColor' : 'none'} />
        </button>

        <div className="flex justify-between items-start pr-10">
          <div>
            <p className="text-xs text-blue-200/40 font-mono mb-1">{order.id}</p>
            <p className="text-white font-bold">{order.date || (order.createdAt?.toDate().toLocaleString())}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            order.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' : 
            order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
            order.status === 'out_of_stock' ? 'bg-orange-500/20 text-orange-400' :
            'bg-blue-500/20 text-blue-400'
          }`}>
            {order.status === 'out_of_stock' ? 'Stock Out' : order.status}
          </span>
        </div>
        
        {order.status === 'out_of_stock' && (
          <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400">
              <AlertCircle size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-orange-400">স্টকে নাই (Out of Stock)</p>
              <p className="text-xs text-orange-300/60">দুঃখিত, এই প্রোডাক্টটি বর্তমানে আমাদের স্টকে নেই। অনুগ্রহ করে অন্য প্রোডাক্ট ট্রাই করুন।</p>
            </div>
          </div>
        )}
        
        <div className="space-y-3 py-4 border-y border-white/5">
          {order.items.map((item, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-blue-200/60">{item.name} x{item.quantity}</span>
                <span className="text-white font-medium">৳{item.price * item.quantity}</span>
              </div>
              {order.status === 'confirmed' && order.credentials && order.credentials[item.id] && (
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-3 mt-2">
                  <p className="text-blue-400 font-bold mb-1 uppercase tracking-widest text-[9px]">Access Credentials</p>
                  {Array.isArray(order.credentials[item.id]) ? (
                    (order.credentials[item.id] as any[]).map((cred: any, i: number) => (
                      <div key={i} className="grid grid-cols-1 gap-2 mb-2 pb-2 border-b border-blue-500/10 last:border-0 last:mb-0 last:pb-0">
                        {cred.email && (
                          <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5 group">
                            <div className="text-[10px]">
                              <span className="text-blue-200/40 uppercase font-bold mr-2">Gmail:</span>
                              <span className="text-white font-mono">{cred.email}</span>
                            </div>
                            <button onClick={() => handleCopy(cred.email)} className="text-blue-400 hover:text-blue-300 transition-all"><Copy size={12}/></button>
                          </div>
                        )}
                        {cred.pass && (
                          <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5 group">
                            <div className="text-[10px]">
                              <span className="text-blue-200/40 uppercase font-bold mr-2">Pass:</span>
                              <span className="text-white font-mono">{cred.pass}</span>
                            </div>
                            <button onClick={() => handleCopy(cred.pass)} className="text-blue-400 hover:text-blue-300 transition-all"><Copy size={12}/></button>
                          </div>
                        )}
                        {cred.key && (
                          <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5 group">
                            <div className="text-[10px]">
                              <span className="text-blue-200/40 uppercase font-bold mr-2">Key:</span>
                              <span className="text-white font-mono">{cred.key}</span>
                            </div>
                            <button onClick={() => handleCopy(cred.key)} className="text-blue-400 hover:text-blue-300 transition-all"><Copy size={12}/></button>
                          </div>
                        )}
                      </div>
                    ))
                  ) : typeof order.credentials[item.id] === 'object' ? (
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
                      <button onClick={() => handleCopy(order.credentials![item.id] as string)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-blue-400 transition-all">
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
    );

    return (
      <div className="pb-24 pt-6 px-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setView('home')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all">
            <ArrowRight className="rotate-180" size={20} />
          </button>
          <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <CreditCard className="text-blue-500" /> Order History
          </h2>
        </div>
        
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
          <div className="space-y-10">
            {pinnedOrders.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600/20 flex items-center justify-center text-blue-400">
                    <Bookmark size={20} fill="currentColor" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">পিন করা অর্ডার (Pinned)</h3>
                    <p className="text-xs text-blue-200/40">আপনার গুরুত্বপূর্ণ অর্ডারগুলো এখানে থাকবে</p>
                  </div>
                </div>
                <div className="space-y-6">
                  {pinnedOrders.map(renderOrderCard)}
                </div>
              </div>
            )}

            <div className="space-y-6">
              {pinnedOrders.length > 0 && (
                <div className="flex items-center gap-3 pt-4">
                  <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-blue-200/40">
                    <CreditCard size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-white">সব অর্ডার (All Orders)</h3>
                </div>
              )}
              <div className="space-y-6">
                {unpinnedOrders.map(renderOrderCard)}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleAddInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInventoryProductId || !newInventoryEmail || !newInventoryPass) {
      showToast('Product, Email, and Password are required');
      return;
    }

    try {
      const inventoryRef = collection(db, 'inventory');
      await addDoc(inventoryRef, {
        productId: newInventoryProductId,
        email: newInventoryEmail,
        password: newInventoryPass,
        key: newInventoryKey || '',
        expiryDays: Number(newInventoryExpiryDays) || 30,
        isUsed: false,
        createdAt: serverTimestamp()
      });
      showToast('Inventory item added successfully!');
      setNewInventoryEmail('');
      setNewInventoryPass('');
      setNewInventoryKey('');
      setNewInventoryExpiryDays('30');
    } catch (err: any) {
      console.error('Add inventory error:', err);
      handleFirestoreError(err, OperationType.CREATE, 'inventory');
      showToast('Failed to add inventory: ' + (err.message || 'Unknown error'));
    }
  };

  const handleDeleteInventory = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'inventory', id));
      showToast('Inventory item deleted successfully!');
      setDeletingInventoryId(null);
    } catch (err: any) {
      console.error('Delete inventory error:', err);
      handleFirestoreError(err, OperationType.DELETE, `inventory/${id}`);
      showToast('Failed to delete inventory: ' + (err.message || 'Unknown error'));
    }
  };

  const renderInventoryView = () => {
    const availableInventory = inventoryItems.filter(item => !item.isUsed);
    const filteredInventory = inventoryFilterProductId === 'all' 
      ? availableInventory 
      : availableInventory.filter(item => item.productId === inventoryFilterProductId);

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <button 
            onClick={() => setAdminSubView('dashboard')}
            className="text-blue-400 flex items-center gap-2 hover:text-blue-300 transition-all w-fit"
          >
            <ArrowRight className="rotate-180" size={16} /> Back
          </button>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Database size={20} className="text-blue-400" /> Inventory Management
          </h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add New Inventory Form */}
          <div className="lg:col-span-1 space-y-4">
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
              <h4 className="text-lg font-bold text-white mb-4">Add Credentials</h4>
              <form onSubmit={handleAddInventory} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-200/40 uppercase tracking-widest">Product</label>
                  <select
                    value={newInventoryProductId}
                    onChange={(e) => setNewInventoryProductId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                    required
                  >
                    <option value="" className="bg-[#0a0a0a]">Select a product...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id} className="bg-[#0a0a0a]">{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-200/40 uppercase tracking-widest">Email</label>
                  <input
                    type="text"
                    value={newInventoryEmail}
                    onChange={(e) => setNewInventoryEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="example@vpn.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-200/40 uppercase tracking-widest">Password</label>
                  <input
                    type="text"
                    value={newInventoryPass}
                    onChange={(e) => setNewInventoryPass(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-200/40 uppercase tracking-widest">Key (Optional)</label>
                  <input
                    type="text"
                    value={newInventoryKey}
                    onChange={(e) => setNewInventoryKey(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="Activation Key"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-blue-200/40 uppercase tracking-widest">Expiry Days</label>
                  <input
                    type="number"
                    value={newInventoryExpiryDays}
                    onChange={(e) => setNewInventoryExpiryDays(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="30"
                    required
                  />
                  <p className="text-[10px] text-blue-200/30">Order history will be deleted for user after these many days.</p>
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={18} /> Add to Inventory
                </button>
              </form>
            </div>
          </div>

          {/* Inventory List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 text-sm text-blue-200/60">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                {inventoryItems.filter(i => !i.isUsed).length} Available
              </div>
              <select
                value={inventoryFilterProductId}
                onChange={(e) => setInventoryFilterProductId(e.target.value)}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
              >
                <option value="all" className="bg-[#0a0a0a]">All Products</option>
                {products.map(p => (
                  <option key={p.id} value={p.id} className="bg-[#0a0a0a]">{p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              {filteredInventory.length === 0 ? (
                <p className="text-blue-200/20 text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">No inventory items found</p>
              ) : (
                filteredInventory.map(item => {
                  const product = products.find(p => p.id === item.productId);
                  return (
                    <div key={item.id} className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-white font-bold text-sm">{product?.name || 'Unknown Product'}</p>
                        <div className="flex items-center gap-3 text-xs text-blue-200/60 font-mono">
                          <span>{item.email}</span>
                          {item.key && <span>• {item.key}</span>}
                          {item.expiryDays && <span>• {item.expiryDays} Days</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${item.isUsed ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {item.isUsed ? 'Used' : 'Available'}
                        </span>
                        {!item.isUsed && (
                          <button
                            onClick={() => setDeletingInventoryId(item.id)}
                            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderUserEditModal = () => (
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
                      showToast('Role updated successfully!');
                    } catch (err) {
                      showToast('Failed to update role.');
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
                      showToast('User updated successfully!');
                    } catch (err) {
                      showToast('Failed to update user.');
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
  );

  const renderAdminPanel = () => {
    return (
      <div className="pb-24 pt-6 px-4 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setView('home')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all">
              <ArrowRight className="rotate-180" size={20} />
            </button>
            <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <ShieldCheck className="text-blue-500" /> Admin Panel
            </h2>
          </div>
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
            {adminSubView === 'dashboard' && renderDashboard()}
            {adminSubView === 'users' && renderUsersView()}
            {adminSubView === 'orders' && renderOrdersView()}
            {adminSubView === 'products' && renderProductsView()}
            {adminSubView === 'support' && renderSupportView()}
            {adminSubView === 'add-product' && renderProductFormView({})}
            {adminSubView === 'edit-product' && renderProductFormView({ isEdit: true })}
            {adminSubView === 'payment-settings' && renderPaymentSettingsView()}
            {adminSubView === 'inventory' && renderInventoryView()}
          </motion.div>
        </AnimatePresence>

        {renderUserEditModal()}
      </div>
    );
  };

  const renderStockOutModal = () => (
    <AnimatePresence>
      {stockOutOrder && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Mark as Out of Stock</h3>
              <button onClick={() => setStockOutOrder(null)} className="text-blue-200/40 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-blue-200/60">Are you sure you want to mark the order for <span className="text-white font-bold">{stockOutOrder.userEmail}</span> as Out of Stock?</p>
              <p className="text-xs text-orange-400/60 bg-orange-400/5 p-3 rounded-xl border border-orange-400/10">This will notify the user that the item is currently unavailable.</p>
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setStockOutOrder(null)}
                className="flex-1 py-3 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  try {
                    await updateDoc(doc(db, 'orders', stockOutOrder.id), { status: 'out_of_stock' });
                    showToast('Order marked as Out of Stock');
                    setStockOutOrder(null);
                  } catch (err: any) {
                    console.error('Stock out error:', err);
                    handleFirestoreError(err, OperationType.UPDATE, `orders/${stockOutOrder.id}`);
                    showToast('Failed to update order status');
                  }
                }}
                className="flex-1 py-3 rounded-xl bg-orange-600 text-white font-bold hover:bg-orange-500 transition-all shadow-lg shadow-orange-600/20 active:scale-95"
              >
                Confirm Stock Out
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const renderDeleteMessageModal = () => (
    <AnimatePresence>
      {deletingMessage && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Delete Message</h3>
              <button onClick={() => setDeletingMessage(null)} className="text-blue-200/40 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-blue-200/60">Are you sure you want to delete this message from <span className="text-white font-bold">{deletingMessage.userEmail}</span>?</p>
              <p className="text-xs text-red-400/60 bg-red-400/5 p-3 rounded-xl border border-red-400/10">This action cannot be undone.</p>
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setDeletingMessage(null)}
                className="flex-1 py-3 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  try {
                    await deleteDoc(doc(db, 'support_messages', deletingMessage.id));
                    setDeletingMessage(null);
                    showToast('Message deleted successfully!');
                  } catch (err: any) {
                    console.error('Delete error:', err);
                    handleFirestoreError(err, OperationType.DELETE, `support_messages/${deletingMessage.id}`);
                    showToast('Failed to delete message.');
                  }
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-600/20 active:scale-95"
              >
                Delete Message
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const renderDeleteInventoryModal = () => (
    <AnimatePresence>
      {deletingInventoryId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Delete Inventory Item</h3>
              <button onClick={() => setDeletingInventoryId(null)} className="text-blue-200/40 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-blue-200/60">Are you sure you want to delete this inventory item?</p>
              <p className="text-xs text-red-400/60 bg-red-400/5 p-3 rounded-xl border border-red-400/10">This action cannot be undone.</p>
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setDeletingInventoryId(null)}
                className="flex-1 py-3 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDeleteInventory(deletingInventoryId)}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-600/20 active:scale-95"
              >
                Delete Item
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const renderDeleteProductModal = () => (
    <AnimatePresence>
      {deletingProduct && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Delete Product</h3>
              <button onClick={() => setDeletingProduct(null)} className="text-blue-200/40 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-blue-200/60">Are you sure you want to delete <span className="text-white font-bold">{deletingProduct.name}</span>?</p>
              <p className="text-xs text-red-400/60 bg-red-400/5 p-3 rounded-xl border border-red-400/10">This action cannot be undone.</p>
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setDeletingProduct(null)}
                className="flex-1 py-3 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  try {
                    await deleteDoc(doc(db, 'products', deletingProduct.id!));
                    showToast('Product Deleted Successfully!');
                    setDeletingProduct(null);
                  } catch (err: any) {
                    console.error('Delete error:', err);
                    handleFirestoreError(err, OperationType.DELETE, `products/${deletingProduct.id}`);
                    showToast('Failed to delete product: ' + (err.message || 'Unknown error'));
                  }
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-600/20 active:scale-95"
              >
                Delete Product
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const renderCancelOrderModal = () => (
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
                    showToast('Order Cancelled Successfully!');
                    setCancellingOrder(null);
                  } catch (err: any) {
                    console.error('Cancel error:', err);
                    handleFirestoreError(err, OperationType.UPDATE, `orders/${cancellingOrder.id}`);
                    showToast('Failed to cancel order: ' + (err.message || 'Unknown error'));
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
  );

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

  if (!user) return renderAuthView();

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

      {renderDeleteMessageModal()}
      {renderDeleteInventoryModal()}
      {renderDeleteProductModal()}
      {renderCancelOrderModal()}
      {renderStockOutModal()}

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
            {view === 'home' && renderHomepage()}
            {view === 'payment' && renderPaymentPage()}
            {view === 'support' && renderSupportPage()}
            {view === 'orders' && renderOrdersPage()}
            {view === 'admin' && user.role === 'admin' && renderAdminPanel()}
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
