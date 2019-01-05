workflow "build, test and publish on release" {
  on = "release"
  resolves = "publish"
}

# install with yarn
action "install" {
  uses = "actions/npm@1.0.0"
  runs = "yarn"
  args = "install"
}

# build with yarn
action "build" {
  needs = "install"
  uses = "actions/npm@1.0.0"
  runs = "yarn"
  args = "build"
}

# test with yarn
action "test" {
  needs = "build"
  uses = "actions/npm@1.0.0"
  runs = "yarn"
  args = "test"
}

# publish with npm
action "publish" {
  needs = "test"
  uses = "actions/npm@1.0.0"
  args = "publish"
  secrets = ["NPM_AUTH_TOKEN"]
}
