(function () {
  "use strict";

  const data = window.INVITATION_DATA;
  const languageButtons = document.querySelectorAll("[data-language]");
  const eventList = document.getElementById("event-list");
  const musicToggle = document.getElementById("music-toggle");
  const musicLabel = document.getElementById("music-label");
  const musicStatus = document.getElementById("music-status");
  const weddingTime = new Date(
    data.weddingDate.year,
    data.weddingDate.month - 1,
    data.weddingDate.day
  ).getTime();
  let audioContext = null;
  let masterGain = null;
  let musicTimer = null;
  let musicPlaying = false;
  let musicStarting = false;
  let musicUnavailable = false;
  let musicRequestId = 0;
  let chordIndex = 0;
  let musicStatusKey = "";

  const musicMessages = {
    en: {
      unsupported: "This browser does not support the original piano music.",
      initializeFailed: "The original piano music could not be initialized.",
      startFailed: "The original piano music could not be started.",
      playing: "Original piano music is playing.",
      paused: "Original piano music is paused.",
    },
    mr: {
      unsupported: "या ब्राउझरमध्ये स्वरचित पियानो संगीत वाजू शकत नाही.",
      initializeFailed: "स्वरचित पियानो संगीत सुरू करता आले नाही.",
      startFailed: "स्वरचित पियानो संगीत सुरू करता आले नाही.",
      playing: "स्वरचित पियानो संगीत सुरू आहे.",
      paused: "स्वरचित पियानो संगीत थांबवले आहे.",
    },
  };

  const originalProgression = [
    { bass: 130.81, arpeggio: [261.63, 329.63, 392, 523.25], melody: [659.25, 587.33] },
    { bass: 98, arpeggio: [246.94, 293.66, 392, 493.88], melody: [587.33, 523.25] },
    { bass: 110, arpeggio: [220, 261.63, 329.63, 440], melody: [659.25, 587.33] },
    { bass: 87.31, arpeggio: [220, 261.63, 349.23, 440], melody: [523.25, 493.88] },
  ];

  function makeTextElement(tagName, className, value) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = value;
    return element;
  }

  function renderEvents(language) {
    const fragment = document.createDocumentFragment();

    data.events.forEach((event, index) => {
      const card = document.createElement("article");
      card.className = event.featured ? "event-card is-featured" : "event-card";

      const number = makeTextElement("span", "event-number", String(index + 1).padStart(2, "0"));
      number.setAttribute("aria-hidden", "true");

      const details = document.createElement("div");
      details.append(
        makeTextElement("h3", "", event.name[language]),
        makeTextElement("p", "", event.date[language])
      );

      if (event.time) {
        details.append(makeTextElement("p", "event-time", event.time[language]));
      }

      if (event.place) {
        details.append(makeTextElement("p", "event-place", event.place[language]));
      }

      card.append(number, details);
      fragment.append(card);
    });

    eventList.replaceChildren(fragment);
  }

  function updateMusicControl() {
    const language = document.documentElement.lang === "mr" ? "mr" : "en";
    const state = musicUnavailable ? "error" : musicPlaying ? "on" : "off";
    musicLabel.textContent = musicLabel.getAttribute(`data-${state}-${language}`);
    musicToggle.setAttribute("aria-pressed", String(musicPlaying));
  }

  function updateMusicStatus(status) {
    if (status) musicStatusKey = status;
    if (!musicStatusKey) return;

    const language = document.documentElement.lang === "mr" ? "mr" : "en";
    musicStatus.textContent = musicMessages[language][musicStatusKey];
  }

  function playPianoNote(frequency, startTime, volume, duration) {
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    envelope.connect(masterGain);

    [1, 2.01, 3.98].forEach((ratio, index) => {
      const oscillator = audioContext.createOscillator();
      const partialGain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency * ratio, startTime);
      partialGain.gain.value = [1, 0.2, 0.07][index];
      oscillator.connect(partialGain);
      partialGain.connect(envelope);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.04);
    });
  }

  function playNextChord() {
    if (!audioContext || !musicPlaying) return;

    const bar = originalProgression[chordIndex % originalProgression.length];
    const startTime = audioContext.currentTime + 0.05;
    playPianoNote(bar.bass, startTime, 0.075, 3.5);
    bar.arpeggio.forEach((frequency, index) => {
      playPianoNote(frequency, startTime + 0.12 + index * 0.72, 0.11, 1.55);
    });
    bar.melody.forEach((frequency, index) => {
      playPianoNote(frequency, startTime + 0.72 + index * 1.5, 0.065, 1.2);
    });
    chordIndex += 1;
  }

  function startOriginalMusic() {
    if (musicPlaying || musicStarting) return;

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      musicUnavailable = true;
      updateMusicStatus("unsupported");
      updateMusicControl();
      return;
    }

    try {
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new AudioContextConstructor();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.0001;
        masterGain.connect(audioContext.destination);
      }
    } catch (error) {
      musicUnavailable = true;
      updateMusicStatus("initializeFailed");
      updateMusicControl();
      console.error("Unable to initialize the original instrumental.", error);
      return;
    }

    musicUnavailable = false;
    musicStarting = true;
    const requestId = ++musicRequestId;
    audioContext.resume().then(() => {
      if (requestId !== musicRequestId) {
        if (!musicStarting && !musicPlaying && audioContext.state === "running") {
          audioContext.suspend().catch((error) => {
            console.error("Unable to suspend the original instrumental.", error);
          });
        }
        return;
      }

      musicStarting = false;
      musicPlaying = true;
      chordIndex = 0;
      masterGain.gain.cancelScheduledValues(audioContext.currentTime);
      masterGain.gain.setTargetAtTime(0.36, audioContext.currentTime, 0.12);
      playNextChord();
      musicTimer = window.setInterval(playNextChord, 4000);
      updateMusicStatus("playing");
      updateMusicControl();
    }).catch((error) => {
      if (requestId !== musicRequestId) return;

      musicStarting = false;
      musicUnavailable = true;
      updateMusicStatus("startFailed");
      updateMusicControl();
      console.error("Unable to start the original instrumental.", error);
    });
  }

  function stopOriginalMusic() {
    musicRequestId += 1;
    musicStarting = false;
    musicPlaying = false;
    window.clearInterval(musicTimer);
    musicTimer = null;

    if (audioContext && masterGain && audioContext.state !== "closed") {
      const now = audioContext.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(0.0001, now, 0.08);
      window.setTimeout(() => {
        if (!musicPlaying && audioContext.state === "running") {
          audioContext.suspend().catch((error) => {
            console.error("Unable to suspend the original instrumental.", error);
          });
        }
      }, 350);
    }

    updateMusicStatus("paused");
    updateMusicControl();
  }

  function applyLanguage(language) {
    const selectedLanguage = language === "mr" ? "mr" : "en";
    document.documentElement.lang = selectedLanguage;

    document.querySelectorAll("[data-en][data-mr]").forEach((element) => {
      element.textContent = element.getAttribute(`data-${selectedLanguage}`);
    });

    languageButtons.forEach((button) => {
      const selected = button.dataset.language === selectedLanguage;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    renderEvents(selectedLanguage);
    updateMusicControl();
    updateMusicStatus();

    try {
      localStorage.setItem("invitation-language", selectedLanguage);
    } catch (error) {
      // Language switching still works when storage is unavailable.
    }
  }

  function setupFamilyCardReveal() {
    const cards = document.querySelectorAll(".family-card[data-reveal]");
    if (
      !cards.length ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      });
    }, { threshold: 0.18 });

    cards.forEach((card) => {
      card.classList.add("reveal-pending");
      observer.observe(card);
    });
  }

  languageButtons.forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.language));
  });

  musicToggle.addEventListener("click", () => {
    if (musicPlaying || musicStarting) {
      stopOriginalMusic();
    } else {
      startOriginalMusic();
    }
  });

  let initialLanguage = "en";
  try {
    initialLanguage = localStorage.getItem("invitation-language") || "en";
  } catch (error) {
    initialLanguage = "en";
  }
  applyLanguage(initialLanguage);

  const openingScreen = document.getElementById("opening-screen");
  const envelopeButton = document.getElementById("invite-envelope");
  const enterButton = document.getElementById("opening-enter");
  const envelopeHint = document.getElementById("envelope-hint");
  const pageContent = document.querySelectorAll(".skip-link, .site-header, main, .site-footer");

  pageContent.forEach((element) => {
    element.inert = true;
  });
  envelopeButton.focus();

  envelopeButton.addEventListener("click", () => {
    if (openingScreen.classList.contains("is-open")) return;

    startOriginalMusic();
    envelopeButton.disabled = true;
    openingScreen.classList.add("is-open");
    envelopeHint.textContent = envelopeHint.getAttribute(
      `data-ready-${document.documentElement.lang}`
    );

    window.setTimeout(() => {
      enterButton.hidden = false;
      enterButton.focus();
    }, 650);
  });

  enterButton.addEventListener("click", () => {
    openingScreen.hidden = true;
    document.body.classList.remove("intro-active");
    pageContent.forEach((element) => {
      element.inert = false;
    });
    setupFamilyCardReveal();
    document.getElementById("main").focus();
  });

  const countdownElements = {
    days: document.getElementById("days"),
    hours: document.getElementById("hours"),
    minutes: document.getElementById("minutes"),
    seconds: document.getElementById("seconds"),
  };
  const countdownComplete = document.getElementById("countdown-complete");

  function updateCountdown() {
    const remaining = weddingTime - Date.now();

    if (remaining <= 0) {
      Object.values(countdownElements).forEach((element) => {
        element.textContent = "00";
      });
      countdownComplete.hidden = false;
      return;
    }

    const values = {
      days: Math.floor(remaining / 86400000),
      hours: Math.floor((remaining % 86400000) / 3600000),
      minutes: Math.floor((remaining % 3600000) / 60000),
      seconds: Math.floor((remaining % 60000) / 1000),
    };

    Object.entries(values).forEach(([unit, value]) => {
      countdownElements[unit].textContent = String(value).padStart(2, "0");
    });
  }

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
})();
