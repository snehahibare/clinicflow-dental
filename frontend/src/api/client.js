const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem("dcms_access_token");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  let response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  // If 401 Unauthorized, try refreshing token
  if (response.status === 401 && !endpoint.includes("/auth/login") && !endpoint.includes("/auth/refresh")) {
    const refreshToken = localStorage.getItem("dcms_refresh_token");
    if (refreshToken) {
      try {
        const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          localStorage.setItem("dcms_access_token", data.access_token);
          localStorage.setItem("dcms_refresh_token", data.refresh_token);

          // Retry original request with new token
          headers["Authorization"] = `Bearer ${data.access_token}`;
          response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers,
          });
        } else {
          // Clear session on refresh failure
          localStorage.removeItem("dcms_access_token");
          localStorage.removeItem("dcms_refresh_token");
          localStorage.removeItem("dcms_user");
          window.dispatchEvent(new CustomEvent("dcms_logout"));
        }
      } catch (err) {
        console.error("Token refresh failed", err);
      }
    }
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.detail || (typeof data?.message === "string" ? data.message : "Request failed");
    throw new Error(errorMsg);
  }

  return data;
}
