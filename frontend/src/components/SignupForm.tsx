import React, { useState } from 'react';

interface SignupFormProps {
  onSignup: (username: string) => void;
  switchToLogin: () => void;
}

const SignupForm: React.FC<SignupFormProps> = ({ onSignup, switchToLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:8000/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.detail || 'Signup failed');
        setLoading(false);
        return;
      }
      onSignup(username);
    } catch (err) {
      setError('Network error');
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-sm flex flex-col items-center mx-auto mt-35 p-6 bg-gray-800 rounded-lg shadow-xl text-white">
      <h2 className="text-2xl font-bold mb-5">Sign Up</h2>
      <form onSubmit={handleSubmit} className="flex flex-col space-y-5 w-full">
        <label className="flex flex-col text-base">
          Username:
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            disabled={loading}
            className="mt-1 p-2.5 rounded-md bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          />
        </label>
        <label className="flex flex-col text-base">
          Password:
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            disabled={loading}
            className="mt-1 p-2.5 rounded-md bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          />
        </label>
        <label className="flex flex-col text-base">
          Confirm Password:
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            disabled={loading}
            className="mt-1 p-2.5 rounded-md bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          />
        </label>
        {error && <p className="text-red-500 mt-2 text-base">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-md disabled:opacity-50 text-base font-semibold"
        >
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>
      </form>
      <p className="mt-4 text-base">
        Already have an account?{' '}
        <button
          className="text-blue-400 underline hover:text-blue-600 focus:outline-none text-base font-semibold"
          onClick={switchToLogin}
          disabled={loading}
        >
          Login
        </button>
      </p>
    </div>
  );
};

export default SignupForm;
