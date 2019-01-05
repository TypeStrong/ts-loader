workflow "build, test and publish on release" {
  on = "push"
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
  uses = "docker://zenika/alpine-chrome:with-node"
  args = "test"
  runs = "yarn"
}

# filter for a new tag
action "check for new tag" {
  needs = "test"
  uses = "actions/bin/filter@master"
  args = "tag"
}

# publish with npm
action "publish" {
  needs = "check for new tag"
  uses = "actions/npm@1.0.0"
  args = "publish"
  secrets = ["NPM_AUTH_TOKEN"]
}
