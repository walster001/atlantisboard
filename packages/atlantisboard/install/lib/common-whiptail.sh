#!/usr/bin/env bash
# Whiptail/theme helpers and input sanitization for installer dialogs.


## atl_apply_theme
# Apply Atlantisboard whiptail color theme.
# Globals:
#   NEWT_COLORS
# Returns:
#   0
atl_apply_theme() {
  # Match default login screen branding (src/shared/types/loginBranding.ts):
  #   background #1f68b5, body text #ffffff,
  #   logo highlight #7ccfed for focused controls.
  # label= is required for whiptail --msgbox body text
  # (without it, distro defaults = unreadable).
  local bg accent fg
  fg=white
  if atl_newt_supports_256_colors; then
    bg=color31    # ~#1f68b5 login backgroundColor
    accent=color117 # ~#7ccfed logo light blue (active yes/no, menus)
  else
    bg=blue
    accent=cyan
  fi
  unset NEWT_COLORS_FILE
  export NEWT_COLORS="
root=,${bg}
window=,${bg}
border=${fg},${bg}
shadow=,black
title=${fg},${bg}
roottext=${fg},${bg}
label=${fg},${bg}
textbox=${fg},${bg}
acttextbox=${fg},${bg}
helpline=${fg},${bg}
button=${fg},${bg}
actbutton=black,white
compactbutton=${fg},${bg}
actcompactbutton=black,white
entry=${fg},${bg}
actentry=black,${accent}
disentry=,${bg}
listbox=${fg},${bg}
actlistbox=black,${accent}
sellslistbox=${fg},${bg}
actsellistbox=black,${accent}
checkbox=${fg},${bg}
actcheckbox=black,${accent}
"
}


atl_newt_supports_256_colors() {
  case "${TERM:-}" in
    *256* | *-color | screen* | tmux* | xterm* | alacritty* \
      | foot* | wezterm* | rxvt* | contour* | kitty* )
      return 0
      ;;
  esac
  case "${COLORTERM:-}" in
    *256* | truecolor )
      return 0
      ;;
  esac
  return 1
}


## atl_whiptail_tty
# Resolve a TTY path for whiptail.
# Outputs:
#   /dev/tty or /dev/null
# Returns:
#   0
atl_whiptail_tty() {
  if [[ -e /dev/tty ]] && (: </dev/tty >/dev/tty) 2>/dev/null; then
    printf '%s' /dev/tty
    return 0
  fi
  printf '%s' /dev/null
}


# Whiptail draws widgets on stdout and prints selected values on stderr
# (see whiptail(1)).
# Capture stderr in a fresh temp file each call.
# Never use 3>&2 1>&2 (values accumulate across prompts).

## atl_whiptail_capture
# Run whiptail and return selected value.
# Arguments:
#   Passed through to whiptail.
atl_whiptail_capture() {
  local tmp tty
  tmp="$(mktemp)"
  tty="$(atl_whiptail_tty)"
  if [[ "$tty" != "/dev/null" ]]; then
    if command whiptail "$@" </dev/tty 2>"$tmp" 1>"$tty"; then
      atl_sanitize_input "$(tr -d '\r' <"$tmp")"
      rm -f "$tmp"
      return 0
    fi
  elif command whiptail "$@" 2>"$tmp" 1>"$tty"; then
    atl_sanitize_input "$(tr -d '\r' <"$tmp")"
    rm -f "$tmp"
    return 0
  fi
  rm -f "$tmp"
  return 1
}


## atl_whiptail_display
# Render a whiptail widget to the active TTY.
# Arguments:
#   Passed through to whiptail.
atl_whiptail_display() {
  local tty rc=0
  tty="$(atl_whiptail_tty)"
  if [[ "$tty" != "/dev/null" ]]; then
    command whiptail "$@" </dev/tty 1>"$tty" 2>"$tty" || rc=$?
  else
    command whiptail "$@" 1>"$tty" 2>"$tty" || rc=$?
  fi
  return "$rc"
}


# Prefer these over raw whiptail.
# Raw calls break Tab/Enter on yes/no under sudo
# (stdin is not /dev/tty).

## atl_whiptail_yesno
# Wrapper for yes/no dialogs using TTY-safe display helper.
atl_whiptail_yesno() {
  atl_whiptail_display "$@"
}


## atl_whiptail_msgbox
# Wrapper for message box dialogs using TTY-safe display helper.
atl_whiptail_msgbox() {
  atl_whiptail_display "$@"
}


## atl_whiptail_infobox
# Wrapper for info box dialogs using TTY-safe display helper.
atl_whiptail_infobox() {
  atl_whiptail_display "$@"
}


atl_sanitize_input() {
  local val="$1"
  val="${val//$'\r'/}"
  val="${val//\"/}"
  val="${val//\'/}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  printf '%s' "$val"
}


atl_extract_domain_from_url() {
  local url host
  url="$(atl_sanitize_input "$1")"
  [[ -z "$url" ]] && return 1
  url="${url#*://}"
  host="${url%%/*}"
  host="${host%%:*}"
  host="${host%%\?*}"
  host="${host,,}"
  [[ -n "$host" ]] || return 1
  printf '%s' "$host"
}


atl_app_url_is_local() {
  local host
  host="$(atl_extract_domain_from_url "${1:-}")" || return 0
  case "$host" in
    localhost | 127.0.0.1 | ::1 | 0.0.0.0)
      return 0
      ;;
    *.local)
      return 0
      ;;
  esac
  return 1
}

