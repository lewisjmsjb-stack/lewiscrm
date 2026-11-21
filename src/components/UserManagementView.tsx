import React, { useMemo, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { AppUser, ManagerDepartment, UserRole } from '../types';
import { hashPassword, validatePassword } from '../utils/auth';
import { generateId, getTodayIso } from '../utils/helpers';

interface UserManagementViewProps {
  currentUser: AppUser;
  users: AppUser[];
  onUpdateUser: (updatedUser: AppUser) => void;
  onCreateUser: (newUser: AppUser) => void;
  onDeleteUser: (userId: string) => void;
  onResetPassword: (userId: string, newHash: string) => void;
  showToast: (msg: string) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUser,
  users,
  onUpdateUser,
  onCreateUser,
  onDeleteUser,
  onResetPassword,
  showToast,
}) => {
  const today = getTodayIso();
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'All'>('All');

  // Create User Modal state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [newRole, setNewRole] = useState<UserRole>('Employee');
  const [newDepartment, setNewDepartment] = useState<ManagerDepartment>('Sales Manager');

  // Reset Password Modal state
  const [resetTargetUser, setResetTargetUser] = useState<AppUser | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState<string>('');
  const [showResetPassword, setShowResetPassword] = useState<boolean>(false);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'All' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === 'Admin').length;
    const managers = users.filter((u) => u.role === 'Manager').length;
    const employees = users.filter((u) => u.role === 'Employee').length;
    const pending = users.filter((u) => u.requestedRole).length;
    return { total, admins, managers, employees, pending };
  }, [users]);

  if (currentUser.role !== 'Admin') {
    return (
      <div className="p-10 bg-white border border-slate-200 rounded-2xl text-center space-y-2">
        <ShieldAlert className="w-10 h-10 text-red-600 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Access Denied</h2>
        <p className="text-sm text-slate-600">
          User management is restricted to Administrator accounts only.
        </p>
      </div>
    );
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      showToast('Full name is required.');
      return;
    }
    if (!validatePassword(newPassword)) {
      showToast('Password must be at least 6 characters.');
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    const created: AppUser = {
      id: generateId('usr'),
      fullName: newName.trim(),
      email: newEmail.trim().toLowerCase(),
      phone: newPhone.trim(),
      passwordHash,
      role: newRole,
      department: newRole === 'Manager' ? newDepartment : undefined,
      verified: true,
      status: 'Active',
      createdAt: today,
    };

    onCreateUser(created);
    setIsCreateOpen(false);
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewPassword('');
    setShowNewPassword(false);
    showToast(`Created user ${created.fullName}.`);
  };

  const handleApproveManager = (user: AppUser) => {
    const updated: AppUser = {
      ...user,
      role: user.requestedRole || 'Manager',
      department: user.requestedDepartment || 'Sales Manager',
      requestedRole: undefined,
      requestedDepartment: undefined,
    };
    onUpdateUser(updated);
    showToast(`Approved manager role for ${user.fullName}.`);
  };

  const handleRoleChange = (user: AppUser, newRole: UserRole) => {
    if (user.id === currentUser.id && newRole !== 'Admin') {
      const adminCount = users.filter((u) => u.role === 'Admin').length;
      if (adminCount <= 1) {
        showToast('Cannot demote the last remaining Administrator.');
        return;
      }
    }

    const updated: AppUser = {
      ...user,
      role: newRole,
      department: newRole === 'Manager' ? user.department || 'Sales Manager' : undefined,
    };
    onUpdateUser(updated);
    showToast(`Updated ${user.fullName} role to ${newRole}.`);
  };

  const handleDepartmentChange = (user: AppUser, dept: ManagerDepartment) => {
    const updated: AppUser = {
      ...user,
      department: dept,
    };
    onUpdateUser(updated);
    showToast(`Updated ${user.fullName} department.`);
  };

  const handleToggleStatus = (user: AppUser) => {
    if (user.id === currentUser.id) {
      showToast('Cannot suspend your own account.');
      return;
    }
    const nextStatus = user.status === 'Suspended' ? 'Active' : 'Suspended';
    const updated: AppUser = { ...user, status: nextStatus };
    onUpdateUser(updated);
    showToast(`${user.fullName} account ${nextStatus.toLowerCase()}.`);
  };

  const handleDelete = (user: AppUser) => {
    if (user.id === currentUser.id) {
      showToast('Cannot delete your own Administrator account.');
      return;
    }
    if (user.role === 'Admin') {
      const adminCount = users.filter((u) => u.role === 'Admin').length;
      if (adminCount <= 1) {
        showToast('Cannot delete the last Administrator account.');
        return;
      }
    }
    if (window.confirm(`Are you sure you want to delete ${user.fullName}?`)) {
      onDeleteUser(user.id);
      showToast(`Deleted ${user.fullName}.`);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    if (!validatePassword(resetPasswordInput)) {
      showToast('Password must be at least 6 characters.');
      return;
    }
    const newHash = await hashPassword(resetPasswordInput);
    onResetPassword(resetTargetUser.id, newHash);
    showToast(`Reset password for ${resetTargetUser.fullName}.`);
    setResetTargetUser(null);
    setResetPasswordInput('');
    setShowResetPassword(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500 font-mono tabular-nums">
            Administrator Access · RBAC Security
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mt-1">
            User Security &amp; Role Management
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsCreateOpen(true);
            setNewPassword('');
            setShowNewPassword(false);
          }}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 inline-flex items-center gap-2 whitespace-nowrap transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Create New User</span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl">
          <div className="text-xs text-slate-500">Total Users</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {stats.total}
          </div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl">
          <div className="text-xs text-slate-500">Admins</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {stats.admins}
          </div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl">
          <div className="text-xs text-slate-500">Managers</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {stats.managers}
          </div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl">
          <div className="text-xs text-slate-500">Employees</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {stats.employees}
          </div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl sm:col-span-1 col-span-2">
          <div className="text-xs text-slate-500">Pending Requests</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {stats.pending}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-8 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full min-h-[44px] pl-10 pr-4 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="sm:col-span-4">
          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'All')}
            className="w-full min-h-[44px] px-3 text-sm bg-white border border-slate-300 rounded-xl text-slate-900"
          >
            <option value="All">All Roles</option>
            <option value="Admin">Admin</option>
            <option value="Manager">Manager</option>
            <option value="Employee">Employee</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Role &amp; Department</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredUsers.map((u) => {
                const isMe = u.id === currentUser.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/70 align-middle">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 inline-flex items-center gap-1.5">
                        <span>{u.fullName}</span>
                        {isMe && (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-semibold">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">ID: {u.id}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800">{u.email || 'No email'}</div>
                      <div className="text-xs font-mono text-slate-500 mt-0.5">
                        {u.phone || 'No phone'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                          className="min-h-[36px] px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900"
                        >
                          <option value="Admin">Admin</option>
                          <option value="Manager">Manager</option>
                          <option value="Employee">Employee</option>
                        </select>
                      </div>

                      {u.role === 'Manager' && (
                        <div>
                          <select
                            value={u.department || 'Sales Manager'}
                            onChange={(e) =>
                              handleDepartmentChange(u, e.target.value as ManagerDepartment)
                            }
                            className="min-h-[34px] px-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                          >
                            <option value="Sales Manager">Sales Manager</option>
                            <option value="Marketing Manager">Marketing Manager</option>
                            <option value="HR Manager">HR Manager</option>
                            <option value="Accountant">Accountant</option>
                            <option value="Customer Follow-Up Manager">Customer Follow-Up Manager</option>
                          </select>
                        </div>
                      )}

                      {u.requestedRole && (
                        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                          <div className="font-semibold">
                            Requested: {u.requestedRole} ({u.requestedDepartment})
                          </div>
                          <button
                            type="button"
                            onClick={() => handleApproveManager(u)}
                            className="px-2.5 py-1 rounded bg-amber-700 text-white font-semibold text-[11px] inline-flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>Approve Manager Request</span>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          u.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setResetTargetUser(u);
                            setResetPasswordInput('');
                            setShowResetPassword(false);
                          }}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1"
                          title="Reset Password"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Password</span>
                        </button>

                        {!isMe && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u)}
                              className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 ${
                                u.status === 'Active'
                                  ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                  : 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              }`}
                              title={u.status === 'Active' ? 'Suspend Account' : 'Activate Account'}
                            >
                              {u.status === 'Active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              <span className="hidden sm:inline">
                                {u.status === 'Active' ? 'Suspend' : 'Activate'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(u)}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              title="Delete User"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE USER MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Create New User</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Sarah Jenkins"
                  className="w-full min-h-[42px] px-3 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="sarah@alpha-ref.sg"
                    className="w-full min-h-[42px] px-3 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+65 9222 3344"
                    className="w-full min-h-[42px] px-3 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Password (≥ 6 chars) *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Welcome1"
                    className="w-full min-h-[42px] px-3 pr-12 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 p-1"
                    aria-label="Toggle password visibility"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full min-h-[42px] px-3 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="Admin">Admin</option>
                    <option value="Manager">Manager</option>
                    <option value="Employee">Employee</option>
                  </select>
                </div>

                {newRole === 'Manager' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                    <select
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value as ManagerDepartment)}
                      className="w-full min-h-[42px] px-3 text-xs border border-slate-300 rounded-xl bg-white"
                    >
                      <option value="Sales Manager">Sales Manager</option>
                      <option value="Marketing Manager">Marketing Manager</option>
                      <option value="HR Manager">HR Manager</option>
                      <option value="Accountant">Accountant</option>
                      <option value="Customer Follow-Up Manager">Customer Follow-Up Manager</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                Reset Password for {resetTargetUser.fullName}
              </h2>
              <button
                type="button"
                onClick={() => setResetTargetUser(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password (≥ 6 characters) *
                </label>
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    value={resetPasswordInput}
                    onChange={(e) => setResetPasswordInput(e.target.value)}
                    placeholder="New secure password"
                    className="w-full min-h-[42px] px-3 pr-12 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 p-1"
                    aria-label="Toggle password visibility"
                  >
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
