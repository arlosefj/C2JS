#include <stdio.h>
#include <iostream>
#include <vector>
#include <cstdlib>
#include <queue>
#include <list>

#include "DenseCRF.h"
#include "CmGMM.h"

extern "C" {

using namespace std;

typedef unsigned char uint8;

float w1 = 6;
float w2 = 10; 
float w3 = 2; 
float alpha = 20;
float beta = 33;
float gama = 3; 
float mu = 41;
double maxWeight = 2;

enum TrimapValue {UserBack = 0, ProbBack = 64, TrimapUnknown = 128, ProbFore = 192, UserFore = 255};

void fitGMMs(float * img3f, float * back1f, float * unary2f, int * mask1s32, CmGMM &backGMM, CmGMM &foreGMM, int width, int height)
{
	float backW = maxWeight;
	for (int y = 0; y < height; y++){
		float* segV = back1f+y*width;
		float* unryV = unary2f+y*2*width;
		int* triV = mask1s32+y*width; 
		float * img = img3f + y*width*3;
		
		for (int x = 0; x < width; x++){
			float prb; // User Back
			switch (triV[x]){
			case UserBack: 
				prb = 0; 
				break;
			case UserFore: 
				prb = 1.f; 
				break;
			default: 
				float foreP = foreGMM.P(img+x*3), backP = backGMM.P(img+x*3);
				prb = 0.8f * foreP/(foreP + backW*backP + 1e-8f);
			}
			segV[x] = prb;
			unryV[2*x] = prb;
			unryV[2*x+1] = 1-prb;

		}
	}
	return ;
}

int process(uint8 * img3u8, int * mask1s32, uint8 * result1u8, int width, int height)
{
	#if 0
	/****** Preprocess ******/
	const int size = width*height;
	// image data as float
	float * img3f = new float[size*3]; 
	for(int i=0; i<size*3; i++)
	{
		img3f[i] = img3u8[i]/255.0;
	}
	// temp segment val usr labeled background 1 other 0 
	float * back1f = new float[size]; 
	for(int i=0; i<size; i++)
	{
		if(mask1s32[i]==UserBack)
			back1f[i] = 1.0f;
		else
			back1f[i] = 0.0f;
	}
	// temp segment val usr labeled background 0 other 1 
	float * fore1f = new float[size]; 
	for(int i=0; i<size; i++)
	{
		if(mask1s32[i]==UserBack)
			fore1f[i] = 0.0f;
		else
			fore1f[i] = 1.0f;
	}
	// temp unary
	float * unary2f = new float[size*2];
	for(int i=0; i<size*2; i++)
	{
		unary2f[i] = 0.0f;
	}

	/****** GMM ******/
	CmGMM backGMM(5);
	CmGMM foreGMM(5);
	backGMM.BuildGMMs(img3f, back1f, width, height);
	foreGMM.BuildGMMs(img3f, fore1f, width, height);
	fitGMMs(img3f, fore1f, unary2f, mask1s32, backGMM, foreGMM, width, height);
	
	/****** CRF ******/
	DenseCRF2D crf(width, height, 2);
	crf.addPairwiseBilateral(alpha, alpha, beta, beta, beta, img3u8, w1);
	crf.addPairwiseGaussian(gama, gama, w2);
	crf.addPairwiseColorGaussian(mu, mu, mu, img3u8, w3);

	crf.setUnaryEnergy(unary2f);
	float* prob = crf.binarySeg(4, 1.f);
	for(int i=0; i<size; i++, prob+=2)
		back1f[i] = prob[1]/(prob[0]+prob[1]+1e-20f);

	/****** Result ******/
	for(int i=0; i<size; i++)
	{
		result1u8[i] = back1f[i]>0.5? 255:0;
	}

	delete []img3f;
	delete []back1f;
	delete []fore1f;
	delete []unary2f;
	
	
	return 0;
	#else
	return img3u8[0];
	#endif
}
}

#if 0
// Binding code
EMSCRIPTEN_BINDINGS(my_class_example) {
  class_<MyClass>("MyClass")
  .constructor<int, std::string>()
    //.function("process", &MyClass::process, allow_raw_pointers())
    .property("x", &MyClass::getX, &MyClass::setX)
    .class_function("process", &MyClass::process, allow_raw_pointers())
    ;
}
#endif