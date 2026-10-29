
/* ==========================================
   FRAME PHOTO GALLERY
   AWS Cognito + API Gateway + S3
   ========================================== */

const CONFIG = {
  apiBaseUrl: "https://o82bt7bkt9.execute-api.us-east-2.amazonaws.com/dev",
  userPoolId: "us-east-2_OUbAj8uae",
  clientId: "baeo0iuvl6plr1dke2c7qrlof"
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool({
  UserPoolId: CONFIG.userPoolId,
  ClientId: CONFIG.clientId
});

const $ = (id) => document.getElementById(id);

let currentUser = null;
let isUploading = false;

/* ---------- MESSAGES ---------- */

function showMessage(elementId, message, type = "info") {
  const element = $(elementId);
  if (!element) return;

  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}

function clearMessage(elementId) {
  showMessage(elementId, "");
}

function setButtonLoading(button, loading, loadingText = "Please wait...") {
  if (!button) return;

  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent =
      button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
}

/* ---------- PAGE VIEW ---------- */
/* IMPORTANT: Only ONE setView function */

function setView(view) {
  const showGallery = view === "gallery";

  if (authPanel) {
    authPanel.hidden = showGallery;
    authPanel.classList.toggle("hidden", showGallery);
  }

  if (galleryPanel) {
    galleryPanel.hidden = !showGallery;
    galleryPanel.classList.toggle("hidden", !showGallery);
    galleryPanel.style.display = showGallery ? "" : "none";
  }

  if (signOutBtn) {
    signOutBtn.classList.toggle("hidden", !showGallery);
    signOutBtn.hidden = !showGallery;
  }

  console.log("View changed:", view);
  console.log("Gallery visible:", showGallery);

  if (showGallery && currentUser) {
    const welcomeText = $("welcomeText");

    if (welcomeText) {
      welcomeText.textContent =
        `Welcome, ${currentUser.getUsername()}`;
    }

    loadPhotos();
  }
}
/* ---------- AUTH FORM NAVIGATION ---------- */

function showAuthForm(formId) {
  document.querySelectorAll(".auth-form").forEach((form) => {
    const isActive = form.id === formId;
    form.hidden = !isActive;
    form.classList.toggle("hidden", !isActive);
  });

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    const activeView =
      formId === "signUpForm" ? "signup" : "signin";

    tab.classList.toggle("active", tab.dataset.view === activeView);
  });

  clearMessage("authMessage");
}
/* ---------- COGNITO HELPERS ---------- */

function getCognitoUser(username) {
  return new AmazonCognitoIdentity.CognitoUser({
    Username: username,
    Pool: userPool
  });
}

function getAuthDetails(username, password) {
  return new AmazonCognitoIdentity.AuthenticationDetails({
    Username: username,
    Password: password
  });
}

function getCurrentCognitoUser() {
  return userPool.getCurrentUser();
}

function getSession(user) {
  return new Promise((resolve, reject) => {
    user.getSession((error, session) => {
      if (error) {
        reject(error);
        return;
      }

      if (!session || !session.isValid()) {
        reject(new Error("Session expired. Please sign in again."));
        return;
      }

      resolve(session);
    });
  });
}

async function getIdToken() {
  const user = getCurrentCognitoUser();

  if (!user) {
    throw new Error("Please sign in first.");
  }

  const session = await getSession(user);
  return session.getIdToken().getJwtToken();
}

/* ---------- API REQUEST ---------- */

async function apiRequest(path, options = {}) {
  const token = await getIdToken();

  const response = await fetch(`${CONFIG.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: token,
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.headers || {})
    }
  });

  const responseText = await response.text();
  let data = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { message: responseText };
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      `Request failed (${response.status})`
    );
  }

  if (typeof data.body === "string") {
    try {
      return JSON.parse(data.body);
    } catch {
      return data;
    }
  }

  return data;
}

/* ---------- SIGN UP ---------- */

$("signUpForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearMessage("authMessage");

  const username = $("signUpEmail")?.value.trim();
  const password = $("signUpPassword")?.value;
  const confirmPassword = $("signUpConfirmPassword")?.value;
  const button = event.submitter;

  if (!username || !password) {
    showMessage("authMessage", "Enter your email and password.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("authMessage", "Passwords do not match.", "error");
    return;
  }

  setButtonLoading(button, true, "Creating account...");

  const attributes = [
    new AmazonCognitoIdentity.CognitoUserAttribute({
      Name: "email",
      Value: username
    })
  ];

  userPool.signUp(
    username,
    password,
    attributes,
    null,
    (error) => {
      setButtonLoading(button, false);

      if (error) {
        showMessage("authMessage", error.message, "error");
        return;
      }

      if ($("confirmEmail")) {
        $("confirmEmail").value = username;
      }

      showAuthForm("confirmForm");

      showMessage(
        "authMessage",
        "Account created! Enter the confirmation code sent to your email.",
        "success"
      );
    }
  );
});

/* ---------- CONFIRM EMAIL ---------- */

$("confirmForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearMessage("authMessage");

  const username = $("confirmEmail")?.value.trim();
  const code = $("confirmCode")?.value.trim();
  const button = event.submitter;

  if (!username || !code) {
    showMessage(
      "authMessage",
      "Enter your email and confirmation code.",
      "error"
    );
    return;
  }

  setButtonLoading(button, true, "Confirming...");

  getCognitoUser(username).confirmRegistration(code, true, (error) => {
    setButtonLoading(button, false);

    if (error) {
      showMessage("authMessage", error.message, "error");
      return;
    }

    showAuthForm("signInForm");

    if ($("signInEmail")) {
      $("signInEmail").value = username;
    }

    showMessage(
      "authMessage",
      "Email confirmed! You can now sign in.",
      "success"
    );
  });
});

/* ---------- SIGN IN ---------- */

$("signInForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearMessage("authMessage");

  const username = $("signInEmail")?.value.trim();
  const password = $("signInPassword")?.value;
  const button = event.submitter;

  if (!username || !password) {
    showMessage(
      "authMessage",
      "Enter your email and password.",
      "error"
    );
    return;
  }

  setButtonLoading(button, true, "Signing in...");

  getCognitoUser(username).authenticateUser(
    getAuthDetails(username, password),
    {
      onSuccess: (session) => {
        setButtonLoading(button, false);

        currentUser = getCurrentCognitoUser();
        

        console.log("LOGIN SUCCESS");
        console.log("Session valid:", session.isValid());

        // Show gallery after successful Cognito login.
        setView("gallery");
      },

      onFailure: (error) => {
        setButtonLoading(button, false);
        showMessage("authMessage", error.message, "error");
      },

      newPasswordRequired: () => {
        setButtonLoading(button, false);

        showMessage(
          "authMessage",
          "Your account requires a new password. Contact the administrator if this persists.",
          "error"
        );
      }
    }
  );
});

/* ---------- FORGOT PASSWORD ---------- */

$("forgotForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearMessage("authMessage");

  const username = $("forgotEmail")?.value.trim();
  const button = event.submitter;

  if (!username) {
    showMessage(
      "authMessage",
      "Enter your registered email.",
      "error"
    );
    return;
  }

  setButtonLoading(button, true, "Sending code...");

  getCognitoUser(username).forgotPassword({
    onSuccess: () => {
      setButtonLoading(button, false);

      if ($("resetEmail")) {
        $("resetEmail").value = username;
      }

      showAuthForm("resetForm");

      showMessage(
        "authMessage",
        "Password reset code sent to your email.",
        "success"
      );
    },

    onFailure: (error) => {
      setButtonLoading(button, false);
      showMessage("authMessage", error.message, "error");
    }
  });
});

/* ---------- RESET PASSWORD ---------- */

$("resetForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearMessage("authMessage");

  const username = $("resetEmail")?.value.trim();
  const code = $("resetCode")?.value.trim();
  const password = $("resetPassword")?.value;
  const button = event.submitter;

  if (!username || !code || !password) {
    showMessage("authMessage", "Complete all fields.", "error");
    return;
  }

  setButtonLoading(button, true, "Updating password...");

  getCognitoUser(username).confirmPassword(code, password, {
    onSuccess: () => {
      setButtonLoading(button, false);
      showAuthForm("signInForm");

      if ($("signInEmail")) {
        $("signInEmail").value = username;
      }

      showMessage(
        "authMessage",
        "Password updated successfully. Please sign in.",
        "success"
      );
    },

    onFailure: (error) => {
      setButtonLoading(button, false);
      showMessage("authMessage", error.message, "error");
    }
  });
});

/* ---------- AUTH TABS ---------- */

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;

    if (view === "signup") {
      showAuthForm("signUpForm");
    } else if (view === "signin") {
      showAuthForm("signInForm");
    }
  });
});

document.querySelectorAll("[data-show-form]").forEach((button) => {
  button.addEventListener("click", () => {
    const formId = button.dataset.showForm;

    if ($(formId)) {
      showAuthForm(formId);
    }
  });
});

/* ---------- SELECT PHOTO ---------- */


/* ---------- SELECT PHOTO ---------- */

$("photoInput")?.addEventListener("change", () => {
  const file = $("photoInput").files?.[0];
  const selected = $("selectedFile");
  const uploadButton = $("uploadBtn");

  if (selected) {
    selected.textContent = file
      ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`
      : "No file selected";
  }

  if (uploadButton) {
    uploadButton.disabled = !file;
  }

  clearMessage("galleryMessage");
});


/* ---------- UPLOAD PHOTO ---------- */

$("uploadBtn")?.addEventListener("click", async () => {
  if (isUploading) return;

  const file = $("photoInput")?.files?.[0];

  if (!file) {
    showMessage(
      "galleryMessage",
      "Please choose a photo first.",
      "error"
    );
    return;
  }

  if (!file.type.startsWith("image/")) {
    showMessage(
      "galleryMessage",
      "Please select an image file.",
      "error"
    );
    return;
  }

  isUploading = true;

  const button = $("uploadBtn");
  const progressArea = $("uploadProgress");
  const progressBar = $("progressBar");
  const progressText = $("progressText");

  setButtonLoading(button, true, "Uploading...");

  if (progressArea) progressArea.hidden = false;
  if (progressBar) progressBar.style.width = "10%";
  if (progressText) progressText.textContent = "Preparing upload...";

  try {
    const uploadInfo = await apiRequest("/upload-url", {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type
      })
    });

    if (!uploadInfo.uploadUrl) {
      throw new Error("Upload URL was not returned by the API.");
    }

    if (progressBar) progressBar.style.width = "35%";
    if (progressText) progressText.textContent = "Uploading photo...";

    const uploadResponse = await fetch(uploadInfo.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        "x-amz-meta-original-filename": encodeURIComponent(file.name)
      },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error(`Photo upload failed (${uploadResponse.status}).`);
    }

    if (progressBar) progressBar.style.width = "100%";
    if (progressText) progressText.textContent = "Upload complete!";

    showMessage(
      "galleryMessage",
      "Photo uploaded successfully!",
      "success"
    );

    $("photoInput").value = "";

    if ($("selectedFile")) {
      $("selectedFile").textContent = "No file selected";
    }

    await loadPhotos();
  } catch (error) {
    showMessage(
      "galleryMessage",
      error.message || "Unable to upload photo.",
      "error"
    );
  } finally {
    isUploading = false;
    setButtonLoading(button, false);
    button.disabled = !($("photoInput")?.files?.[0]);

    setTimeout(() => {
      if (progressArea) progressArea.hidden = true;
      if (progressBar) progressBar.style.width = "0%";
    }, 1200);
  }
});

/* ---------- LOAD GALLERY ---------- */

async function loadPhotos() {
  const grid = $("photoGrid");
  if (!grid) return;

  grid.innerHTML = "";
  showMessage("galleryMessage", "Loading your photos...", "info");

  try {
    const result = await apiRequest("/photos", {
      method: "GET"
    });

    const photos = Array.isArray(result)
      ? result
      : (result.photos || result.items || []);

    if ($("photoCount")) {
      $("photoCount").textContent = String(photos.length);
    }

    if (photos.length === 0) {
      if ($("emptyState")) {
        $("emptyState").hidden = false;
        $("emptyState").classList.remove("hidden");
      }

      clearMessage("galleryMessage");
      return;
    }

    if ($("emptyState")) {
      $("emptyState").hidden = true;
      $("emptyState").classList.add("hidden");
    }

    photos.forEach((photo) => {
      const card = document.createElement("article");
      card.className = "photo-card";

      const imageWrap = document.createElement("div");
      imageWrap.className = "photo-image-wrap";

      const image = document.createElement("img");
      image.className = "photo-image";
      image.alt = photo.fileName || "Gallery photo";
      image.loading = "lazy";
      image.src = photo.thumbUrl || photo.imageUrl || photo.url || "";

      image.addEventListener("error", () => {
        image.alt = "Preview unavailable";
      });

      imageWrap.appendChild(image);

      const footer = document.createElement("div");
      footer.className = "photo-card-footer";

      const info = document.createElement("div");
      info.className = "photo-info";

      const name = document.createElement("p");
      name.className = "photo-name";
      name.textContent = photo.fileName || "Untitled photo";
      name.title = name.textContent;

      const date = document.createElement("p");
      date.className = "photo-date";
      date.textContent = photo.uploadedAt
        ? new Date(photo.uploadedAt).toLocaleDateString()
        : "Photo Gallery";

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-button";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.setAttribute(
        "aria-label",
        `Delete ${name.textContent}`
      );

      deleteButton.addEventListener("click", async () => {
        if (!confirm(`Delete "${name.textContent}"?`)) return;

        deleteButton.disabled = true;
        deleteButton.textContent = "Deleting...";

        try {
          await apiRequest("/photos", {
            method: "DELETE",
            body: JSON.stringify({
              photoId: photo.photoId
            })
          });

          showMessage(
            "galleryMessage",
            "Photo deleted successfully.",
            "success"
          );

          await loadPhotos();
        } catch (error) {
          deleteButton.disabled = false;
          deleteButton.textContent = "Delete";

          showMessage(
            "galleryMessage",
            error.message || "Unable to delete photo.",
            "error"
          );
        }
      });

      info.append(name, date);
      footer.append(info, deleteButton);
      card.append(imageWrap, footer);
      grid.appendChild(card);
    });

    clearMessage("galleryMessage");
  } catch (error) {
    showMessage(
      "galleryMessage",
      error.message || "Unable to load gallery.",
      "error"
    );

    if ($("emptyState")) {
      $("emptyState").hidden = false;
      $("emptyState").classList.remove("hidden");
    }
  }
}

/* ---------- REFRESH GALLERY ---------- */

$("refreshBtn")?.addEventListener("click", loadPhotos);

/* ---------- SIGN OUT ---------- */

$("signOutBtn")?.addEventListener("click", () => {
  const user = getCurrentCognitoUser();

  if (user) {
    user.signOut();
  }

  currentUser = null;

  setView("auth");
  showAuthForm("signInForm");

  showMessage(
    "authMessage",
    "You have signed out.",
    "success"
  );
});

/* ---------- RESTORE SESSION ---------- */

window.addEventListener("DOMContentLoaded", async () => {
  showAuthForm("signInForm");

  const user = getCurrentCognitoUser();

  if (!user) {
    currentUser = null;
    setView("auth");
    return;
  }

  try {
    await getSession(user);

    currentUser = user;
    setView("gallery");
  } catch (error) {
    user.signOut();
    currentUser = null;
    setView("auth");
  }
});
