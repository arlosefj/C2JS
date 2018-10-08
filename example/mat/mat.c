int test0(unsigned char *x, int width, int height) {
  return width;
}

int test1(unsigned char *x) {
  return x[1];
}

int test2(unsigned char *x) {
  x[3] = 1;
  return x[3];
}